# node-pj


## Install
```sh
$ npm install pj
```

## Features
 * Custom type casting within select clauses
 * Parameterized query substitution for values, fields, tables, operators, and functions
 * Using literals in clauses
 * Implicit joins within where blocks


## Examples

### Introduction

This API is designed to allow you to programatically construct SQL queries for PostgreSQL fast and efficiently. 

```javascript
var pj = require('pj');

// connect to database
var db = new pj('blake@/project_db');

// define a relationship that joins two tables
db.define('retailer.owned_by=owner.id');

// some values to exclude from our query
var exclude_states = ['Hawaii','Alaska'];

db.from('retailers')
    .select('.name','location::geojson', 'email=owner.email_address')
    .where({
        country: 'USA',
		state: pj('!=', exclude_states),
		owner: {
			name: pj('not like', '%o\'connor')
		}
	})
	.order('name');
```

will generate SQL equivalent to:

```sql
select
    "retailers"."name" as "name",
    ST_AsGeoJSON("location") as "location",
    "owner"."email_address" as "email"
from "retailers"
join "owner" on "retailer"."owned_by"="owner"."id"
where (
    "country" = 'United States'
      and ("state" != 'Hawaii' and "state" != 'Alaska')
      and "owner"."name" not like '%o''connor'
) order by "name" asc
```


### Connecting to a database

You can create a new instance of `pj` to get a handle to your database:

```javascript
var retailers = new pj('postgres://user@host:5432/database');

// or...

var retailers = new pj({
	user: 'user',
	host: 'host',
	port: 5432,
	database: 'database',
});
```

You can also use the global `pj` as a handle to a single database by passing connection parameters to the `global` option in `pj.config`:

```javascript
pj.config({
	global: {
		user: 'blake',
		host: 'localhost', // this is also by default
		port: 5432, // this is also by default
		database: 'my_db',
	},
});

pj.from('my_table')
	...
```



## Select Clause

```js
.select(field_1 [, field_2, ..., field_n)
```

Where `typeof field_` must be either `string` or `object`. The `string` version supports a strict syntax for specifying column names, creating an alias, aggregating rows, using SQL operators, and type casting. The following section documents this syntax.

### Fields

There are several different ways to access a field, each one has a specific purpose.


#### Named Identifiers

Using standard PostgreSQL identifier characters in the select-syntax string will yield a named identifier. 

```js
	.from('post').select('id')
```
yields:
```sql
	select "id" from "post"
```

This can be useful for selecting aliases created elsewhere in the statement, but it is prone to ambiguation when multiple tables are joined together. To reference a column when there is more than one table present, you should use absolute references.


#### Absolute References

Prefixing the column name with a dot will produce an absolute reference to that column by using the name of the primary table specified in the `from` clause:

```js
	.from('post').select('.id')
```
yiels:
```sql
	select "post"."id" from "post"
```

It is typically a best practice to use absolute references when joining tables in order to prevent conflicts of columns with the same name from different tables:

```js
	.from('post').select('post.id', 'user.id', 'user.name')
```

yields *(assuming the `post <-> user` table relationship is defined)*:
```sql
	select "post"."id", "user"."id", "user"."name" from "post" join "user" on "user"."id" = "post"."user_id"
```


#### Aliasing

Any field (including the outputs of functions) can be aliased by using the `=` operator:

```js
	.from('post').select('post_id=post.id')
```
yields:
```sql
	select "post"."id" as "post_id" from "post"
```

Aliasing the table specified in the `from` clause will also be reflected in the dotal-prefix syntax:

```js
	.from('p=post').select('.id')
```
yields:
```sql
	select "p"."id" from "post" as "p"
```


### Type Casting

Any field (including the outputs of functions) can be cast into alternate data types by using the `::` operator.


#### Native Data Types

[PostgreSQL Data Types](http://www.postgresql.org/docs/9.4/static/datatype.html) can simply be placed after the `::` operator for casting to those types:

```js
	.select('post.score::int')
```
yields:
```sql
	select "post"."score"::int
```

Some native data types also accept arguments:

```js
	.select('post.score::decimal(6,4)')
```
yields:
```sql
	select "post"."score"::decimal(6,4)
```


#### Custom Type Casters / Function Substitution

You can define your own type casters using the `pj.type` function

```js
	pj.type(string typeDef, string outputSub)
	pj.type(string typeDef, function outputGen)
```

##### Parameterized String Substitution

Passing a string into the `output` parameter will essentially substitue the field and any input arguments into the formatted string:

```js

	// defines a custom type, globally
	pj.type('epoch_ms', 'extract(epoch from $0) * 1000');

	db.select('time::epoch_ms').from('post')
```
yields:
```sql
	select extract(epoch from "time") * 1000 as "time" from "post"
```

##### The $0 Parameter

Parameters/variables are prefixed with a `$` symbol. `$0` references the field preceding the `::` operator, although the above function can also be invoked like this:

```js
	.select('epoch_ms(time)').from('post')
```
yields:
```sql
	select extract(epoch from "time") * 1000 as "time" from "post"
```

##### Ordinally-named Parameters: Fields

When creating a custom type caster, if the parameter name is an integer then the subsequent replacement will yield the matching field name:

```js
	pj.type('properName($1)', "concat($1, ',', $0)");
	db.from('user').select('properName(firstName, lastName)')
```
yields:
```sql
	select concat("lastName", ',', "firstName") as "properName" from "user"
```

##### Textually-named Parameters: Values

Using textually-named parameters will substitute escaped values into the string:
```js
	// specifies an optional parameter
	pj.type('epoch_ms($tz=UTC)', "extract(epoch from $0 at time zone $tz)");

	db.select('time::epoch_ms').from('post'); // parenthesis are optional
	db.select('time::epoch_ms()').from('post'); // will also use the default value
	db.select('time::epoch_ms(PST)').from('post'); // note: argument is not enclosed with quotes
```
yields (respectively):
```sql
	select extract(epoch from "time" at time zone 'UTC') as "time" from "post";
	select extract(epoch from "time" at time zone 'UTC') as "time" from "post";
	select extract(epoch from "time" at time zone 'PST') as "time" from "post";
```

##### Prefix-named Parameters: SQL Injection

If you wish to inject non-values (such as SQL keywords) into the query, you may prefix the variable name with `_`:
```js
	pj.type('addTime($_type,$value)', '$0 + $_type $value');
	db.from('post').select('.time::addTime(interval, 3 hours)');
```
yields:
```sql
	select "post"."time" + interval '3 hours'
```

Notice how the arguments to the call are not enclosed by any quotes. Arguments are terminated by the `)` character; for subtitution strings they are split by `,` delimiter. Custom type casters that specify a function instead of a string however receive the entire text within the `(` `)` characters (ie: the text is not split). This allows the handling function to parse the arguments however it wants (albeit devoid of any right parenthesis characters).


#### PostGIS Type Casters

By default, `pj` provides some custom types that alias [PostGIS Geometry Functions](http://postgis.net/docs/manual-2.1/reference.html) for constructing, accessing, editing, and outputting geometry data:

For example:
```js
	.from('buildings').select('boundary::rotateX(90deg)::geojson')
```
yields:
```sql
	select ST_AsGeoJSON(ST_RotateX("boundary", pi()*0.5)) as "boundary" from "building"
```

Here is a table that shows which functions are mapped to by their equivalent type cast alias:

| PostGIS Function | `pj` Type Equivalent |
| ---------------- | -------------------- |
| ST_AsGeoJSON 	| geojson 	|
| ST_AsKML 		| kml  		|
| ST_AsText 	| wkt 		|
| ST_AsEWKT		| ewkt 		|
| ST_AsEWKB		| ewkb 		|
| ST_AsBinary	| binary 	|
| ST_AsGeoHash 	| geohash 	|
| ST_AsSVG 		| svg 		|
| ST_AsLatLonText | latlon 	|
| | |
| ST_GeomFromText	| wkt_geom |
| ST_GeomFromWKB	| wkb_geom	|
| ST_GeomFromEWKB	| ewkb_geom	|
| ST_GeomFromEWKT	| ewkt_geom	|
| ST_GeomFromGeoHash	| geohash_geom	|
| ST_GeomFromGML	| gml_geom	|
| ST_GeomFromGeoJSON	| geojson_geom	|
| ST_GeomFromKML	| kml_geom	|
| | |
| ST_GeogFromText	| wkt_geog |
| ST_GeogFromWKB	| wkb_geog	|
| ST_GeogFromEWKB	| ewkb_geog	|
| ST_GeogFromEWKT	| ewkt_geog	|
| | |



### Selecting Literals (Slash-Notation)

To generate values (single-quoted literals) within the select clause, you can use this special slash-notation:

```js
	.from().select('/This is a string/')
```
yields:
```sql
	select 'This is a string'
```

Any single-quotes within the `/` delimiters are escaped:
```js
	.from().select("/This is a 'string'/")
```
yields:
```sql
	select 'This is a ''string'''
```

The first and last occurences of the `/` delimiter set the bounds for the value, so you do not need to worry about escaping extra `/` characters:
```js
	var text = "Don't worry / I'm safe!";
	db.from().select('output=/'+text+'/')
```
yields:
```sql
	select 'Don''t worry / I''m safe!' as "output"
```

The slash-notation is convenient for constructing geometry with PostGIS:

```js
	.select('pointA=/point(34.72 -118.25)/::wkt_geom','pointB=/point(36.12 -119.4)/::wkt_geom','distance(pointA,pointB)')
```

```sql
	select ST_GeomFromWKT('point(34.72 -118.25)') as "pointA", ST_GeomFromWKT('point(36.12 -119.4)') as "pointB", ST_Distance("pointA", "pointB") as "distance"
```
