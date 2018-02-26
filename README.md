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

## Api

See [spec.md](spec.md).

## Configuring

MC++ will look in the spigot server dir for a file called `mc++.json`. If present, it must be a valid JSON object and only contain some, none or all of these properties:

 - `javaMemStart`: String || `"1G"`  
 The amount of memory that java can use. Equivalent to `-Xms=amount` on the command-line.
 - `javaMemMax`: String || `"1G"`  
 The amount of memory that java can use. Equivalent to `-Xmx=amount` on the command-line.
 - `javaArgs`: String || `""`
 Any extra JVM args to add.
 - `discord`: Object || null
 Information for MC++s discord bot.
  - `token`: String  
  The token for the discord bot. Can be found at [https://discordapp.com/developers/applications/me](https://discordapp.com/developers/applications/me).
  - `auditLog`: Object || null
    - `guildId`: String  
    The guild to send OP commands to. This is a Discord snowflake, which can be found by enabling User Settings -> Appearance -> Developer Mode, and then right-clicking on the guild and then "Copy Id".
    - `channelId`: String  
    The channel to send OP commands to. This is a Discord snowflake; see above for obtaining instructions.
    - `commandBlacklist`: Array
    An array of commands to ignore.
