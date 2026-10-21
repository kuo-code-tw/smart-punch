# Immediate history backup — awaiting backend deployment

The front end checks capabilities and keeps the backup button disabled until
this backend extension is deployed. A disabled button does not mean a backup
was performed. The history roster presentation can ship independently.

Before installation, read and back up the current Apps Script source. Add
`history-immediate-backup.gs` as a new script file and add these routes to the
existing wrappers without changing their other branches.

At the start of `doGet`, after `params` and `action` are computed:

```js
if(action==='historyBackupCapabilities'){
  try{return jsonOutput(p79HistoryBackupCapabilities_(params));}
  catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}
}
```

At the start of `doPost`, after `parsedData` and `action` are computed:

```js
if(action==='historyBackupMonth'){
  try{return jsonOutput(p79HistoryBackupMonth_(parsedData));}
  catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}
}
```

Use the existing deployment URL when releasing a new Apps Script version.
The new handler requires history management access and a verified superadmin,
uses a short acquisition of the shared write lock, reads a snapshot and creates
an independent backup spreadsheet in the matching existing history folder.
It does not rewrite main records or existing annual archives. Backup content
is read back before success is returned. A request ID receipt prevents an
acknowledged backup from being repeated if its HTTP response was lost.

For a production check, verify capabilities with the authorized account and
create one explicitly selected month/type backup, then inspect its file,
counts and source-sheet preservation. Do not claim that a local fixture test
verified a production write.
