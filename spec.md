# Spec
The WebSocket server allows you to get information and updates from the server, as well as send commands, list players, etc.

You will periodically get JSON messages sent. These will have one or more properties explaining something changing on the server, etc. These are the list of properties you could receive. For forwards compatibility, fail gracefully when you recieve a property you don't understand.

## Properties You Will Recieve
- `newState`: Number  
    This is a Number explaining the new state of the server. You will get this when you initially connect to the socket. Possible values are:
    - 0: The server is starting.
    - 1: The server is running
    - 2: The server is stopping.


- `loadTime`: String  
    This is a String that shows the time it took to start the server and is sent around the same time (before or after) the state changes from 0 to 1.


- `crash`: Object
   - `code`: Number
    the exit code of spigot (may be null)
   - `signal`: String
    the signal spigot was terminated with (may be null)


- `exit`: Object
   - `code`: Number
    the exit code of spigot (may be null)
   - `signal`: String
    the signal spigot was terminated with (may be null)


 - `backups`: Array  
  This is an array of ISO 8601 timestamps representing all backups of the world folders. This will be send on initial connection, and quite frequently after. **Note that the
`:`s in the ISO string are replaced with `_` because **~~LoseDoze~~** Windows doesn't like `:` in file names.**
  #### Backup scheduling
  At most one backup is stored one hour *within the past 24 hours* (1000 * 60 * 60 ms, not 1 clock hour). After the past 24 hours, at most one backup is stored per calendar day. Yeah, I know the backup system is weird, but it was the easiest option that actually made come kind of sense. If someone is interested in adding a PR that fixes this, it'd be great. I might also fix it later.

 - `port`: Number  
  This is the port that the server is running. If the server has announced it's port yet, it will be sent on connection. Also, the port will be send whenever it is announced or is changed.

 - `error`: String  
  This will be sent if something wrong happened while processing a sent object. Make sure your JSON is correct and encoded in UTF-8. The String will be `err.toString()` from the thrown error from Node.js.

 - `correctAuth`: Boolean  
  This will be `true` if auth from `auth` was correct, otherwise `false`.


## Properties You Can Send

 - `auth`: Object
  - `username`: String
  - `password`: String
   Try to see if a username / password combo is correct. You be responded with `correctAuth` shortly.

Everything below requires the auth object to be sent along with it.

 - `restoreBackup`: String  
   The current world will be rolled back to this backup.

  - `deleteBackup`: String  
    This deletes a backup with the name of the String.

    NOT IMPLEMENTED YET

 - `op`: String
  Give OP permissions to the player with the name or UUID of the String specified.
