// Maximo 7.6 -> MAS Manage upgrade readiness: read-only SQL for Microsoft SQL Server, Oracle and IBM Db2.
//
//   readySql(db, prefixes) -> { key: sql }
//     db       : "sqlserver" | "oracle" | "db2"
//     prefixes : comma-separated Java package prefixes treated as IBM-shipped (default "psdi.,com.ibm.")
//
// Every key returns the same column names on every database. Every statement is a SELECT on Maximo's own tables
// or on the catalog of the Maximo schema: nothing is created or changed, and no DBA access is needed.
// Created by Mohamed Chihaoui.
function readySql(db, prefixes) {
  db = db || "sqlserver";
  var SS = db == "sqlserver", ORA = db == "oracle", DB2 = db == "db2";
  var DUAL = ORA ? " from dual" : DB2 ? " from sysibm.sysdummy1" : "";
  var CAT = SS ? " + " : " || ";

  // ---- IBM package prefixes: letters, digits, dot and underscore only (they are pasted into SQL)
  var pre = [];
  var raw = String(prefixes == null || prefixes === "" ? "psdi.,com.ibm." : prefixes).split(",");
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i].replace(/^\s+|\s+$/g, "");
    if (p.length > 0 && /^[A-Za-z0-9._]+$/.test(p)) pre.push(p);
  }
  if (pre.length == 0) pre = ["psdi.", "com.ibm."];

  // ---- dialect helpers
  function vc(x, n) { return "cast(" + x + " as " + (ORA ? "varchar2(" : "varchar(") + n + "))"; }
  function str(x) { return SS ? "cast(" + x + " as varchar(40))" : ORA ? "to_char(" + x + ")" : "trim(cast(" + x + " as char(40)))"; }
  function lit(s) { return vc("'" + s + "'", 60); }
  function limit(sql, n) {
    if (SS) return "select top " + n + " " + sql.substring(7);
    if (ORA) return "select * from (" + sql + ") where rownum <= " + n;
    return sql + " fetch first " + n + " rows only";
  }
  function blank(x) { return "nullif(ltrim(rtrim(" + x + ")), '')"; }
  // a Java class name is package-qualified (has a dot); placeholders such as "x" or "no_class" are not classes
  function isCustom(x) {
    var s = "(" + blank(x) + " is not null and " + x + " like '%_._%'";
    for (var j = 0; j < pre.length; j++) s += " and " + x + " not like '" + pre[j].replace(/_/g, SS ? "[_]" : "\\_") + "%'" + (SS ? "" : " escape '\\'");
    return s + ")";
  }
  // text search inside a large text column (automation script source is a CLOB on Oracle and Db2)
  function has(col, s) {
    if (SS) return "charindex('" + s + "', " + col + ") > 0";
    if (ORA) return "dbms_lob.instr(" + col + ", '" + s + "') > 0";
    return "locate('" + s + "', " + col + ") > 0";
  }
  function anyOf(col, list) {
    var p = [];
    for (var k = 0; k < list.length; k++) p.push(has(col, list[k]));
    return "(" + p.join(" or ") + ")";
  }
  function clobLen(col) { return SS ? "len(" + col + ")" : ORA ? "dbms_lob.getlength(" + col + ")" : "length(" + col + ")"; }
  // a value that is a local folder path or a web address
  //   folder: C:\..., C:/..., \\server\share, \DOCLINKS (not a regular expression), /opt /home /tmp /var /mnt /data /apps /usr
  //   web   : http(s)://..., anything with :// or localhost
  var ROOTS = ["/opt/", "/home/", "/tmp/", "/var/", "/mnt/", "/data/", "/apps/", "/usr/"];
  function isFolder(x) {
    var s = "(" + x + " like '_:\\%' or " + x + " like '_:/%' or (" + x + " like '\\%' and " + x + " not like '%|%')";
    for (var r = 0; r < ROOTS.length; r++) s += " or " + x + " like '" + ROOTS[r] + "%'";
    return s + ")";
  }
  function isWeb(x) { return "(" + x + " like '%://%' or " + x + " like '%localhost%')"; }
  function pathOrUrl(x) { return "(" + isFolder(x) + " or " + isWeb(x) + ")"; }
  function kindOf(x) {
    return "case when " + x + " like '%localhost%' then 'Local host' when " + isWeb(x) + " then 'Web address' else 'Folder path' end";
  }

  var o = { prefixList: pre.join(", ") };

  // ================================================================== Java classes that are not IBM-shipped
  var CLS =
      " select 1 sk, " + lit("Object class") + " kind, objectname owner, " + vc("null", 60) + " member, classname cls from maxobject where " + isCustom("classname")
    + " union all select 2, " + lit("Attribute class") + ", objectname, attributename, classname from maxattribute where " + isCustom("classname")
    + " union all select 3, " + lit("Service class") + ", servicename, " + vc("null", 60) + ", classname from maxservice where " + isCustom("classname")
    + " union all select 4, " + lit("Cron task") + ", crontaskname, " + vc("null", 60) + ", classname from crontaskdef where " + isCustom("classname")
    + " union all select 5, " + lit("Action") + ", action, objectname, value from action where type = 'CUSTOM' and " + isCustom("value")
    + " union all select 6, " + lit("Condition") + ", conditionnum, " + vc("null", 60) + ", classname from condition where type = 'CLASS' and " + isCustom("classname")
    + " union all select 7, " + lit("Endpoint handler") + ", handlername, " + vc("null", 60) + ", handlerclassname from maxhandler where " + isCustom("handlerclassname")
    + " union all select 8, " + lit("Object structure") + ", intobjectname, " + lit("definition class") + ", defclass from maxintobject where " + isCustom("defclass")
    + " union all select 8, " + lit("Object structure") + ", intobjectname, " + lit("processing class") + ", procclass from maxintobject where " + isCustom("procclass")
    + " union all select 9, " + lit("Publish channel") + ", ifacename, " + lit("processing class") + ", ifaceexitclass from maxifaceout where " + isCustom("ifaceexitclass")
    + " union all select 9, " + lit("Publish channel") + ", ifacename, " + lit("user exit class") + ", ifaceuserexitclass from maxifaceout where " + isCustom("ifaceuserexitclass")
    + " union all select 10, " + lit("Enterprise service") + ", ifacename, " + lit("processing class") + ", ifaceexitclass from maxifacein where " + isCustom("ifaceexitclass")
    + " union all select 10, " + lit("Enterprise service") + ", ifacename, " + lit("user exit class") + ", ifaceuserexitclass from maxifacein where " + isCustom("ifaceuserexitclass");

  // ================================================================== automation scripts and what they depend on
  // SQL Server keeps the script source in a legacy text column: cast it before searching or measuring
  var SRC = SS ? "cast(s.source as varchar(max))" : "s.source";
  var F_FILE = ["java.io.File", "java.nio.file", "FileWriter", "FileReader"];
  var F_OS = ["Runtime.getRuntime", "ProcessBuilder", "subprocess", "os.system"];
  var F_JDBC = ["getDBManager", "java.sql.", "createStatement", "prepareStatement"];
  var F_URL = ["http://", "https://", "localhost"];
  var F_NET = ["httplib", "urllib", "java.net.", "HttpURLConnection", "HttpClient"];
  var F_LIB = ["sys.path"];
  var F_PATH = [":\\", "/opt/", "/tmp/", "/home/", "/var/"];
  var CHECKS = [
    ["Files", anyOf(SRC, F_FILE)], ["OS commands", anyOf(SRC, F_OS)], ["Direct SQL", anyOf(SRC, F_JDBC)],
    ["Outbound calls", anyOf(SRC, F_NET)], ["Web addresses", anyOf(SRC, F_URL)], ["Server libraries", anyOf(SRC, F_LIB)],
    ["Folder paths", anyOf(SRC, F_PATH)],
    ["JavaScript engine", "lower(s.scriptlanguage) in ('javascript', 'js', 'nashorn', 'ecmascript')"]];
  // flags: readable list; nflags: how many (Oracle treats '' as NULL, so never filter on the text)
  var FL = [], NF = [];
  for (var c = 0; c < CHECKS.length; c++) {
    FL.push("case when " + CHECKS[c][1] + " then '" + CHECKS[c][0] + "; ' else '' end");
    NF.push("case when " + CHECKS[c][1] + " then 1 else 0 end");
  }
  var SCRIPTS =
    "select s.autoscript, s.scriptlanguage lang, s.active, " + FL.join(CAT) + " flags, " + NF.join(" + ") + " nflags, " +
    clobLen(SRC) + " chars, (select count(*) from scriptlaunchpoint l where l.autoscript = s.autoscript) lps from autoscript s";
  o.scriptsSql = limit("select x.autoscript, x.lang, x.active, x.flags, x.nflags, x.chars, x.lps from (" + SCRIPTS + ") x" +
                       " where x.nflags > 0 order by x.active desc, x.nflags desc, x.lps desc, x.autoscript", 150);

  // ================================================================== folder paths and web addresses Maximo is configured with
  o.depsSql = limit(
    "select d.kind, d.owner, d.item, d.val from (" +
    "select " + kindOf("propvalue") + " kind, " + lit("System property") + " owner, propname item, " + vc("propvalue", 200) + " val from maxpropvalue where " + pathOrUrl("propvalue") +
    " union all select " + kindOf("value") + ", " + vc("endpointname", 60) + ", property, " + vc("value", 200) + " from maxendpointdtl where " + pathOrUrl("value") +
    ") d order by case when d.kind = 'Folder path' then 1 when d.kind = 'Local host' then 2 else 3 end, d.owner, d.item", 150);

  // attachments by how they are stored (DOCINFO.URLTYPE: FILE = a path on the server or a share)
  o.docsSql = "select urltype utype, count(*) n, min(" + vc("urlname", 120) + ") sample from docinfo group by urltype order by 2 desc";

  // ================================================================== integration endpoints by handler
  o.endpointsSql = "select handlername handler, count(*) n, min(endpointname) first_ep, max(endpointname) last_ep" +
                   " from maxendpoint group by handlername order by 2 desc, 1";

  // ================================================================== sign-in, users and directory sync
  o.signinSql =
    "select 1 sk, 'mxe.useAppServerSecurity' item, (select max(propvalue) from maxpropvalue where propname = 'mxe.useAppServerSecurity') val" + DUAL +
    " union all select 2, 'Active LDAPSYNC instances', " + str("(select count(*) from crontaskinstance where crontaskname = 'LDAPSYNC' and active = 1)") + DUAL +
    " union all select 3, 'Active VMMSYNC instances', " + str("(select count(*) from crontaskinstance where crontaskname = 'VMMSYNC' and active = 1)") + DUAL +
    " union all select 4, 'Active users', " + str("(select count(*) from maxuser where status = 'ACTIVE')") + DUAL +
    " union all select 5, 'Security groups', " + str("(select count(*) from maxgroup)") + DUAL +
    " union all select 6, 'Enabled external systems', " + str("(select count(*) from maxextsystem where enabled = 1)") + DUAL +
    " union all select 7, 'Active email listeners', " + str("(select count(*) from crontaskinstance where crontaskname = 'LSNRCRON' and active = 1)") + DUAL +
    " union all select 8, 'Active JMS queue consumers', " + str("(select count(*) from crontaskinstance where crontaskname in ('JMSQSEQCONSUMER', 'JMSQCONSUMER') and active = 1)") + DUAL +
    " order by 1";

  // ================================================================== database code that Maximo does not manage
  // Maximo ships its own: <TABLE>_T / <TABLE>_U rowstamp triggers on its tables, MAXIMO_* and PLUS* procedures,
  // and views registered in MAXOBJECT. Everything else in the schema was created outside Maximo.
  // Long table names are cut short in trigger names (AHBLTHRESHOLDRANG_T on Oracle, AHBLTHRESHOLDRANGT on Db2).
  var shipped = function (nameCol, typeExpr) {
    var u = "upper(" + nameCol + ")";
    var L = (SS ? "len(" : "length(") + u + ")";
    var sub = function (n) { return (SS ? "substring(" : "substr(") + u + ", 1, " + L + " - " + n + ")"; };
    var trig =
      "((" + u + " like '%\\_T' escape '\\' or " + u + " like '%\\_U' escape '\\') and exists (select 1 from maxtable t where t.tablename = " + sub(2) +
      " or (" + L + " >= 18 and t.tablename like " + sub(2) + CAT + "'%')))" +
      " or ((" + u + " like '%T' or " + u + " like '%U') and " + L + " >= 18 and exists (select 1 from maxtable t where t.tablename like " + sub(1) + CAT + "'%'))";
    return "(" + u + " like 'PLUS%' or " + u + " like 'MAXIMO\\_%' escape '\\' or exists (select 1 from maxobject m where m.objectname = " + u + ")" +
           " or (" + typeExpr + " = 'Trigger' and (" + trig + ")))";
  };
  var DBOBJ;
  if (SS) {
    DBOBJ = "select case o.type when 'TR' then 'Trigger' when 'P' then 'Stored procedure' when 'V' then 'View' else 'Function' end otype," +
            " o.name oname, convert(varchar(10), o.modify_date, 120) changed from sys.objects o" +
            " where o.is_ms_shipped = 0 and o.type in ('TR', 'P', 'FN', 'IF', 'TF', 'V')";
  } else if (ORA) {
    DBOBJ = "select initcap(lower(o.object_type)) otype, o.object_name oname, to_char(o.last_ddl_time, 'YYYY-MM-DD') changed from user_objects o" +
            " where o.object_type in ('TRIGGER', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'VIEW')";
  } else {
    DBOBJ = "select 'Trigger' otype, t.trigname oname, varchar_format(t.create_time, 'YYYY-MM-DD') changed from syscat.triggers t where t.trigschema = current schema" +
            " union all select case r.routinetype when 'P' then 'Stored procedure' else 'Function' end, r.routinename, varchar_format(r.alter_time, 'YYYY-MM-DD')" +
            " from syscat.routines r where r.routineschema = current schema and r.origin <> 'S'" +
            " union all select 'View', v.viewname, cast(null as varchar(10)) from syscat.views v where v.viewschema = current schema";
  }
  var DBOBJ_OUT = "select x.otype, x.oname, x.changed from (" + DBOBJ + ") x where not " + shipped("x.oname", "x.otype");
  o.dbObjSql = limit(DBOBJ_OUT + " order by 1, 2", 200);

  // ================================================================== add-ons and industry solutions, by application prefix
  var PFX = SS ? "left(app, 5)" : "substr(app, 1, 5)";
  o.addonsSql = "select " + PFX + " pfx, count(*) n, min(" + vc("description", 100) + ") sample1, max(" + vc("description", 100) + ") sample2" +
                " from maxapps where app like 'PLUS%' group by " + PFX + " order by 2 desc";

  // ================================================================== Maximo Anywhere footprint (replaced by Maximo Mobile in MAS)
  o.anywhereSql =
    "select " + lit("Application") + " kind, app item from maxapps where app like 'ANYWHERE%'" +
    " union all select " + lit("Endpoint") + ", endpointname from maxendpointdtl where " + vc("value", 400) + " like '%MaximoAnywhere%'" +
    " union all select " + lit("Cron task instance") + ", instancename from crontaskinstance where crontaskname like 'ANYWHERE%' and active = 1";

  // ================================================================== data volume (how long the upgrade window is)
  if (SS) {
    o.sizeSql = "select (select sum(a.total_pages) * 8 / 1024.0 from sys.allocation_units a) total_mb," +
                " (select count(*) from sys.tables) ntables, (select count(*) from docinfo) ndocs";
    o.tablesSql =
      "select top 10 t.name tbl," +
      " (select sum(cast(p2.rows as float)) from sys.partitions p2 where p2.object_id = t.object_id and p2.index_id in (0, 1)) nrows," +
      " sum(a.total_pages) * 8 / 1024.0 total_mb" +
      " from sys.tables t join sys.partitions p on p.object_id = t.object_id" +
      " join sys.allocation_units a on a.container_id = p.partition_id" +
      " group by t.object_id, t.name order by sum(a.total_pages) desc";
  } else if (ORA) {
    o.sizeSql = "select (select sum(bytes) / 1048576 from user_segments) total_mb, (select count(*) from user_tables) ntables," +
                " (select count(*) from docinfo) ndocs from dual";
    o.tablesSql = limit(
      "select x.tbl, max(t.num_rows) nrows, sum(x.bytes) / 1048576 total_mb from (" +
      "select s.segment_name tbl, s.bytes from user_segments s where s.segment_type like 'TABLE%'" +
      " union all select i.table_name, s.bytes from user_segments s join user_indexes i on i.index_name = s.segment_name where s.segment_type like 'INDEX%'" +
      " union all select l.table_name, s.bytes from user_segments s join user_lobs l on l.segment_name = s.segment_name" +
      " union all select l.table_name, s.bytes from user_segments s join user_lobs l on l.index_name = s.segment_name" +
      ") x join user_tables t on t.table_name = x.tbl group by x.tbl order by 3 desc", 10);
  } else {
    var D2SIZE = "(double(t.fpages) * p.pagesize + coalesce((select sum(double(x.nleaf)) from syscat.indexes x" +
                 " where x.tabschema = t.tabschema and x.tabname = t.tabname and x.nleaf > 0), 0) * coalesce(ip.pagesize, p.pagesize)) / 1048576";
    var D2FROM = " from syscat.tables t join syscat.tablespaces p on p.tbspace = t.tbspace left join syscat.tablespaces ip on ip.tbspace = t.index_tbspace" +
                 " where t.tabschema = current schema and t.type = 'T' and t.fpages > 0";
    o.sizeSql = "select (select sum(" + D2SIZE + ")" + D2FROM + ") total_mb," +
                " (select count(*) from syscat.tables where tabschema = current schema and type = 'T') ntables," +
                " (select count(*) from docinfo) ndocs from sysibm.sysdummy1";
    o.tablesSql = "select t.tabname tbl, double(t.card) nrows, " + D2SIZE + " total_mb" + D2FROM + " order by 3 desc fetch first 10 rows only";
  }

  // ================================================================== status line and the summary by area
  var DBVER = SS ? "cast(serverproperty('ProductVersion') as varchar(30))"
            : ORA ? "(select max(version) from product_component_version where product like 'Oracle%')"
            : "(select trim(cast(max(versionnumber) as char(20))) from sysibm.sysversions)";
  var DBNAME = SS ? "db_name()" : ORA ? "sys_context('USERENV', 'DB_NAME')" : "current server";
  o.statusSql = "select (select max(varvalue) from maxvars where varname = 'MAXUPG') maxupg, " + DBVER + " dbver, " + DBNAME + " dbname" + DUAL;

  var C = function (sql) { return "(" + sql + ")"; };
  var N_CLS = C("select count(*) from (" + CLS + ") c");
  var N_SCR = C("select count(*) from autoscript");
  var N_RISK = C("select count(*) from (" + SCRIPTS + ") x where x.nflags > 0");
  var N_DEPS = C("select count(*) from maxpropvalue where " + pathOrUrl("propvalue")) + " + " +
               C("select count(*) from maxendpointdtl where " + pathOrUrl("value"));
  var N_DOCS = C("select count(*) from docinfo where urltype = 'FILE'");
  var N_EP = C("select count(*) from maxendpoint where handlername in ('JMS', 'FLATFILE', 'XMLFILE', 'IFACETABLE', 'CMDLINE', 'EJB')");
  var N_SIGN = C("select count(*) from crontaskinstance where crontaskname in ('LDAPSYNC', 'VMMSYNC') and active = 1") + " + " +
               C("select count(*) from maxpropvalue where propname = 'mxe.useAppServerSecurity' and propvalue = '1'");
  var N_DBO = C("select count(*) from (" + DBOBJ_OUT + ") d");
  var N_ANY = C("select count(*) from (" + o.anywhereSql + ") a");
  var N_ADD = C("select count(distinct " + PFX + ") from maxapps where app like 'PLUS%'");
  var N_USR = C("select count(*) from maxuser where status = 'ACTIVE'");

  o.kpiSql = "select " + N_CLS + " classes, " + N_SCR + " scripts, " + N_RISK + " risky, " + N_DEPS + " deps, " +
             N_EP + " endpoints, " + N_DBO + " dbobjs, " + N_ADD + " addons, " + N_USR + " users" + DUAL;

  var AREAS = [[1, N_CLS], [2, N_RISK], [3, N_DEPS], [4, N_DOCS], [5, N_EP], [6, N_SIGN], [7, N_DBO], [8, N_ANY], [9, N_ADD]];
  var a = [];
  for (var q = 0; q < AREAS.length; q++) a.push("select " + AREAS[q][0] + " sk, " + AREAS[q][1] + " n" + DUAL);
  o.areasSql = "select z.sk, z.n from (" + a.join(" union all ") + ") z order by z.sk";

  // the class list for section 1
  o.classesSql = "select c.sk, c.kind, c.owner, c.member, c.cls from (" + CLS + ") c order by c.sk, c.owner, c.member";
  o.classKindsSql = "select c.kind, count(*) n from (" + CLS + ") c group by c.sk, c.kind order by c.sk";

  // every statement carries the marker right after its first keyword
  for (var k in o) if (typeof o[k] == "string" && /Sql$/.test(k)) o[k] = "select /* mxready */ " + o[k].replace(/^\s*select /, "");
  return o;
}
if (typeof module !== "undefined") module.exports = { readySql: readySql };
