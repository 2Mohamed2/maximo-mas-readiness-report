# Maximo MAS Upgrade Readiness (BIRT)

Created by Mohamed Chihaoui.

A read-only BIRT report for Maximo 7.6 systems on their way to **Maximo Application Suite (MAS) Manage**. It lists,
area by area, what has to be rebuilt, reworked, reconfigured, migrated or replaced, and doubles as the work list for the
upgrade project. **One file works on Microsoft SQL Server, Oracle and IBM Db2**: each data set reads the database
product name from Maximo's report connection and sends the matching SQL. It runs with the Maximo database login; no
DBA access is needed.

## What it shows

| Area | Action | Section |
|---|---|---|
| Java customizations (object, attribute, service, cron, action, condition, handler and integration classes outside IBM packages) | Rebuild into a customization archive | 1 |
| Automation scripts that depend on the server: files, OS commands, direct SQL, outbound calls, hard-coded addresses, Jython libraries from server folders, JavaScript engine | Rework | 2 |
| Folder paths and host names in system and endpoint properties (C:\\..., \\\\share, /opt/..., localhost, URLs) | Reconfigure | 3 |
| Attachments stored on a file path (DOCINFO) | Migrate | 3 |
| Environment-bound endpoints (JMS, FLATFILE, XMLFILE, IFACETABLE, CMDLINE, EJB), with what to do per handler | Reconfigure | 4 |
| Maximo Anywhere apps, endpoints and cron tasks (replaced by Maximo Mobile) | Replace | 4 |
| Sign-in and directory sync (application-server security, LDAPSYNC, VMMSYNC), users, groups, external systems, listeners, JMS consumers | Replace | 5 |
| Triggers, procedures, functions, packages and views Maximo does not manage | Review | 6 |
| Add-ons and industry solutions (PLUS* application prefixes) | Enable | 7 |
| Database size, table count, attachments, largest tables | Plan the window | 8 |

Page 1 has the Maximo and database version, tiles for each area, and a summary table that marks areas with nothing to do.

## Install

1. **Report Administration > New Report**: file name `maximo_mas_readiness.rptdesign`, description
   `Maximo MAS Upgrade Readiness`, application `LICTRACK` (or any application). Save.
2. **Import Report**, pick `maximo_mas_readiness.rptdesign`, **OK**.
3. **Generate Request Page** (once; a second click while it runs fails with BMXAA7118E).
4. **Preview**. Parameter **IBM class prefixes** (default `psdi.,com.ibm.`): Java packages treated as IBM-shipped; add a
   business partner's prefix if their code moves as a product.

## Files

| File | What it is |
|---|---|
| `maximo_mas_readiness.rptdesign` | The report to import. |
| `ready_sql.js` | All SQL: `readySql(db, prefixes)` returns the same columns for `sqlserver`, `oracle`, `db2`. Embedded at build time. |

## How the checks decide

- **Custom class**: a class name whose package does not start with an IBM prefix .
- **Script dependencies**: a text search of each script's source for known patterns (`java.io.File`, `Runtime.getRuntime`, `getDBManager`, `httplib`, `sys.path`, `http://`, `C:\`, `/opt/`...). A match means "look at this script", not "it fails".
- **Database objects outside Maximo**: everything in the Maximo schema except the rowstamp triggers Maximo creates for its tables (`<TABLE>_T`, `<TABLE>_U`, cut short for long names), `MAXIMO_*` and `PLUS*` routines, and views registered in Database Configuration.
- **Add-ons**: applications grouped by their `PLUS*` prefix, with two example application names.

## Tested

2026-11-23 inside Maximo 7.6 (Report Administration import, request page, preview to PDF) on SQL Server 2022,
Oracle 21c and Db2 11.5.8, and every query through the Microsoft, Oracle and IBM JDBC drivers.

## Not covered

Application Designer changes, start centers, workflows, report designs and data move with the database and need a
functional test, not a rebuild. Database and operating system versions: check the MAS compatibility matrix.
