# tracker README

The extension tracker logs the activity of the user in a database. Each activityy is related to a git commit.

## Features

* logs file modifications and shell executions.
* stores repository data and changes in the database 

## Requirements

Needs a psql database to store the logs. Migrations may be performed manually.

## Extension Settings

This extension contributes the following settings:

* `tracker.host`: host address of the database.
* `tracker.user`: database user .
* `tracker.password`: database password.
* `tracker.database`: database name.
* `tracker.port`: port on which the database can be reached.


## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

### 1.0.0

Added log to database.

