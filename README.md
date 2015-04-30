# node-pj

## WARNING: This package is currently under development! It is essentially vaporware right now. Do not download this code expecting anything to work. This README documents the future capabilities of this package.


## Install
```sh
$ npm install pj
```

## Features
 * Parameterized queries for values, columns, tables, operators, and functions
 * Function aliasing within `select` clauses
 * Implicit joins via `where` directives


## Examples

### Introduction

This API is designed to allow you to programatically construct SQL queries for PostgreSQL fast and efficiently. 

```javascript
var pj = require('pj');

// connect to database (uses node-postgres on node.js environments)
var db = new pj('blake@/project_db');

// define a relationship that joins two tables
db.relate('retailer.owned_by=owner.id');

// some values to exclude from our query
var exclude_states = ['Hawaii','Alaska'];

db.from('retailers')
    .select('.name','location::geojson', 'email=owner.email_address')
    .where({
        country: 'USA',
		state: pj('!=', exclude_states),
		owner: {
			name: pj('not like', '%o\'connor'),
			phone: /^[0-9]{10}$/,
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
      and "owner"."phone" ~ '^[0-9]{10}$'
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

On the other hand, you may omit all arguments to the `pj` constructor if you only wish to generate query strings:

```javascript
var gen = pj();
```


## Select Clause

```javascript
.select(field_1 [, field_2, ..., field_n)
```

Where `typeof field_` must be either `string` or `object`. The `string` version supports a strict syntax for specifying column names, creating an alias, aggregating rows, calling functions, using SQL operators, and type casting. The following section documents this syntax.

### Fields

There are several different ways to access a field, each one has a specific purpose.


#### Named Identifiers

Using standard PostgreSQL identifier characters in the select-syntax string will yield a named identifier. 

```javascript
	.from('post').select('id')
```
yields:
```sql
	select "id" from "post"
```

This can be useful for selecting aliases created elsewhere in the statement, but it is prone to ambiguation when multiple tables are joined together. To reference a column when there is more than one table present, you should use absolute references.


#### Absolute References

Prefixing the column name with a dot will produce an absolute reference to that column by using the name of the primary table specified in the `from` clause:

```javascript
	.from('post').select('.id')
```
yiels:
```sql
	select "post"."id" from "post"
```

It is typically a best practice to use absolute references when joining tables in order to prevent conflicts of columns with the same name from different tables:

```javascript
	.from('post').select('post.id', 'user.id', 'user.name')
```

yields *(assuming the `post <-> user` table [relationship is defined](#implicit-joins))*:
```sql
	select "post"."id", "user"."id", "user"."name" from "post" join "user" on "user"."id" = "post"."user_id"
```


#### Aliasing

Any field (including the outputs of functions) can be aliased by using the `=` operator:

```javascript
	.from('post').select('post_id=post.id')
```
yields:
```sql
	select "post"."id" as "post_id" from "post"
```

Aliasing the table specified in the `from` clause will also be reflected in the dotal-prefix syntax:

```javascript
	.from('p=post').select('.id')
```
yields:
```sql
	select "p"."id" from "post" as "p"
```


### Type Casting

Any field (including the outputs of functions) can be cast into alternate data types by using the `::` operator.


#### Native Data Types

[PostgreSQL Data Types](http://www.postgresql.org/docs/9.4/static/datatype.html) that appear after the `::` operator will simply cast the preceding field's value to its type:

```javascript
	.select('post.score::int')
```
yields:
```sql
	select "post"."score"::int
```

Some native data types also accept arguments:

```javascript
	.select('post.score::decimal(6,4)')
```
yields:
```sql
	select "post"."score"::decimal(6,4)
```


#### Function Aliasing

You can define your own custom 'functions' by aliasing PostgreSQL functions using `pj.alias`:

```javascript
	pj.alias(string aliasDef, string outputSub)
	pj.alias(string aliasDef, function outputGen)
```

You may also defined these aliases on a single `pj` instance. Doing this will prevent other instances of `pj` (which were created from the same `pj` object) from holding conflicting aliases.

```javascript
	.alias(string aliasDef, string outputSub)
	.alias(string aliasDef, function outputGen)
```

These aliases are invoked (and perform their subsequent substitution) by using the `::` operator, in the same way that type-casting is done:

```javascript
	pj.alias('excite', "concat($0, '!')");
	db.from('fruit').select('color::excite');
```
yields:
```sql
	select concat("color", '!') from "fruit"
```


##### Parameterized String Substitution

Passing a string into the `output` parameter will essentially substitue the field and any input arguments into the formatted string:

```javascript

	// defines a custom function alias, globally
	pj.alias('epoch_ms', 'extract(epoch from $0) * 1000');

	db.select('time::epoch_ms').from('post')
```
yields:
```sql
	select extract(epoch from "time") * 1000 as "time" from "post"
```

##### The $0 Parameter

Parameters/variables are prefixed with a `$` symbol. `$0` references the field preceding the `::` operator, although the above function can also be invoked like this:

```javascript
	.select('epoch_ms(time)').from('post')
```
yields:
```sql
	select extract(epoch from "time") * 1000 as "time" from "post"
```

##### Ordinally-named Parameters: Fields

When creating a custom function alias, if the parameter name is an integer then the subsequent replacement will yield the matching field name:

```javascript
	pj.alias('describeItem($1)', "concat($1, ' is ', $0)");
	db.from('fruit').select('describeItem(type, color)')
```
yields:
```sql
	select concat("type", ' is ', "color") as "describeItem" from "fruit"
```

The only exception is if the argument is created using the [slash-notation](#slash-notation), which turns the argument into a single-quoted value.


##### Textually-named Parameters: Values

Using textually-named parameters will substitute escaped values into the string:
```javascript
	// specifies an optional parameter
	pj.alias('epoch_ms($tz=UTC)', "extract(epoch from $0 at time zone $tz)");

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
```javascript
	pj.alias('addTime($_type,$value)', '$0 + $_type $value');
	db.from('post').select('.time::addTime(interval, 3 hours)');
```
yields:
```sql
	select "post"."time" + interval '3 hours'
```

Notice how the arguments to the call are not enclosed by any quotes. Arguments are terminated by the `)` character; for subtitution strings they are split by `,` delimiter. Custom function aliases that call `pj.alias` with a javascript function instead of a string however receive the entire text within the `(` `)` characters (ie: the text is not split). This allows the handling function to parse the arguments however it wants (albeit devoid of any right parenthesis characters).

##### TODO: document `pj.alias('eg', function(){})`


#### Passing Arguments

In some cases, you may need to opt for this style of passing arguments:

```javascript
	.select([string alias,] array fields [, string casters])
```

This style allows you apply different functions to multiple fields, and then apply a function that accepts those expressions as inputs:

```javascript
	db.select([
		'trajectory::startPoint',
		'trajectory::endPoint'
	], '::distance');
```
yields:
```sql
	select ST_Distance(
		ST_StartPoint("trajectory"),
		ST_EndPoint("trajectory")
	) as "distance";
```

`startPoint`, `endPoint` and `distance` are PostGIS function aliases that come shipped with `pj`.


#### PostGIS Function Aliases

By default, `pj` defines several functions that alias [PostGIS Geometry Functions](http://postgis.net/docs/manual-2.1/reference.html) for constructing, accessing, editing, and outputting geometry data:

For example:
```javascript
	.from('buildings').select('boundary::rotateX(90deg)::geojson')
```
yields:
```sql
	select ST_AsGeoJSON(ST_RotateX("boundary", pi()*0.5)) as "boundary" from "building"
```

Here is a table that shows which functions are mapped to by their equivalent alias:

##### Geometry Constructors

| PostGIS Function | `pj` Alias Equivalent |
| ---------------- | -------------------- |
| ST_AsGeoJSON 		| geojson 	|
| ST_AsKML 			| kml  		|
| ST_AsText 		| wkt 		|
| ST_AsEWKT			| ewkt 		|
| ST_AsEWKB			| ewkb 		|
| ST_AsBinary		| binary 	|
| ST_AsGeoHash 		| geohash 	|
| ST_AsSVG 			| svg 		|
| ST_AsLatLonText 	| latlon 	|
| | |
| ST_GeomFromText		| wkt_geom 		|
| ST_GeomFromWKB		| wkb_geom		|
| ST_GeomFromEWKB		| ewkb_geom		|
| ST_GeomFromEWKT		| ewkt_geom		|
| ST_GeomFromGeoHash	| geohash_geom	|
| ST_GeomFromGML		| gml_geom		|
| ST_GeomFromGeoJSON	| geojson_geom	|
| ST_GeomFromKML		| kml_geom		|
| | |
| ST_GeogFromText	| wkt_geog 	|
| ST_GeogFromWKB	| wkb_geog	|
| ST_GeogFromEWKB	| ewkb_geog	|
| ST_GeogFromEWKT	| ewkt_geog	|
| | |


##### Geometry Accessors

| PostGIS Function | `pj` Alias Equivalent |
| ---------------- | -------------------- |
| ST_X 				| x 		|
| ST_Y 				| y 		|
| ST_Z 				| z 		|
| ST_M 				| m 		|
| | |
| ST_NumPoints 		| numPoints 	|
| ST_NPoints 		| nPoints 		|
| ST_PointN			| pointN 		|
| ST_StartPoint 	| startPoint 	|
| ST_EndPoint 		| endPoint 		|
| | |
| ST_NumInteriorRings 	| numInteriorRings 	|
| ST_NRings 			| nRings 			|
| ST_ExteriorRing 		| exteriorRing 		|
| ST_InteriorRingN		| interiorRingN 	|
| | |
| ST_NumGeometries		| numGeometries 	|
| ST_GeometryN			| geometryN 		|


##### Geometry Editors

| PostGIS Function | `pj` Alias Equivalent |
| ---------------- | -------------------- |
| ST_Scale 			| scale 			|
| ST_Translate 		| translate 		|
| ST_Rotate 		| rotate 			|
| ST_RotateX 		| rotateX 			|
| ST_RotateY 		| rotateY 			|
| ST_RotateZ 		| rotateZ 			|
| ST_Affine 		| affine 			|
| ST_TransScale 	| transScale 		|
| | |
| ST_Transform 		| transform 		|
| ST_SetSRID		| setSrid 			|



### <a name="slash-notation"> Selecting Literals (Slash-Notation)

To generate values (single-quoted literals) within the select clause, you can use this special slash-notation:

```javascript
	.from().select('/This is a string/')
```
yields:
```sql
	select 'This is a string'
```

Any single-quotes within the `/` delimiters are escaped:
```javascript
	.from().select("/This is a 'string'/")
```
yields:
```sql
	select 'This is a ''string'''
```

The first and last occurences of the `/` delimiter set the bounds for the value, so you do not need to worry about escaping extra `/` characters:
```javascript
	var text = "Don't worry / I'm safe!";
	db.from().select('output=/'+text+'/')
```
yields:
```sql
	select 'Don''t worry / I''m safe!' as "output"
```

Since this notation only allows you to insert one single-quoted value per javascript string, you can exploit the `array fields` parameter of the `select` function to pass multiple single-quoted values to a function:

```javascript
	db.set('join($1)', 'concat($0, ' ', $1');
	db.select('message=', [
		'/hello,/',
		'/world!/'
	], '::join')
```
yields:
```sql
	select concat('hello,', ' ', 'world!') as "message";
```

The slash-notation is convenient for constructing geometry with PostGIS:

```javascript
	.select([
		'/point(34.72 -118.25)/::wkt_geom',
		'/point(36.12 -119.4)/::wkt_geom'
	], '::distance')
```
yields:
```sql
	select ST_Distance(
		ST_GeomFromText('point(34.72 -118.25)'),
		ST_GeomFromText('point(36.12 -119.4)')
	) as "distance"
```



## <a name="implicit-joins"> Implicit Joins

You can take advantage of fixed relationships by declaring how two tables are related to one another.

```javascript
	.relate(string relationship)
	.relate(string tableA_dot_columnB, string tableX_dot_columnY)
```

For example:

```javascript
	db.relate('post.user_id=user.id');

	db.from('post').where({
		user: {
			name: 'jedi',
		}
	})
```
yields:
```sql
	select * from "post"
		join "user" on "post"."user_id" = "user"."id"
		where "user"."name" = 'jedi';
```
	
