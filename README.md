# MC++
*Spigot server wrapper &amp; web UI*

## Features

 - Config Panel on [localhost:25566](http://localhost:25566).
  - View backups
  - Restore backups
  - Delete backups
  - View server status
  - Requires username & password for modifying backups
 - Server monitoring (restarts if it crashes)
 - [GPLv3](LICENSE)

## Installing

```bash
git clone https://github.com/programmer5000-com/mc-plus-plus.git
cd mc-plus-plus
npm i
```

## Running

```bash
node . /path/to/spigot.jar
```

You probably should run this in a screen session.

## Configuring

MC++ will look in the spigot server dir for a file called `mc++.json`. If present, it must be a valid JSON object and only contain some, none or all of these properties:

 - `javaMemStart`: String || `"1G"`  
 The amount of memory that java can use. Equivalent to `-Xms=amount` on the command-line.
 - `javaMemMax`: String || `"1G"`  
 The amount of memory that java can use. Equivalent to `-Xmx=amount` on the command-line.
 - `javaArgs`: String || `""`
 Any extra JVM args to add.
