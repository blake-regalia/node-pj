# node-pj


## Install
```sh
$ npm install pj
```

## Features
 * Parameterized query substitution for values, fields, tables, operators, and functions
 * Select function aliasing
 * Using literals in clauses
 * Implicit joins from where blocks


## Examples

### Introduction

```javascript
var pj = require('pj');

var db = new pj('blake@/project_db');

var exclude_states = ['Hawaii','Alaska'];
db.from('retailers')
    .select('name','location::geojson')
    .where({
        country: 'United States',
		state: pj('!=', exclude_states),
	})
	.order('name');
```

will generate SQL equivalent to:

```sql
select
    "retailers"."name",
    ST_AsGeoJSON("retailers"."location") as "location"
from "retailers"
where (
    "retailers"."country"='United States'
      and ("retailers"."state" != 'Hawaii' and "retailers"."state" != 'Alaska')
) order by "name" asc
```


### Connecting to a database

You can create a new instance of `pj` to get a handle to your database:

```javascript
var retailers = new pj('postgres://user@host/database');

// or...

var retailers = new pj({
	user: 'user',
	host: 'host',
	database: 'database',
});
```

You can also use the global `pj` as a handle to a single database by passing connection parameters to the `global` option in `pj.config`:

```javascript
pj.config({
	global: {
		user: 'blake',
		host: 'localhost', // this is also by default
		database: 'db_1337',
	},
});

pj.from('my_table')
	...
```


### 
