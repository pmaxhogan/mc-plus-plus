# Spec
The WebSocket server allows you to get information and updates from the server, as well as send commands, list players, etc.

You will periodically get JSON messages sent. These will have one or more properties explaining something changing on the server, etc. These are the list of properties you could receive. For forwards compatibility, fail gracefully when you recieve a property you don't understand.

## Properties
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
  This is an array of ISO 8601 timestamps representing all backups of the world folders. This will be send on initial connection.
