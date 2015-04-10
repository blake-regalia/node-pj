# node-pjs


## Install
```sh
$ npm install pjs
```


## Examples

### Select

```javascript
var pjs = require('pjs');

pjs.config({
	global: true,
});

pjs.from('retailers')
    .select('name','location::geojson')
    .where({
        country: 'United States',
		state: pg('!=','Texas'),
	})
	.order('name')
	.dump();
```

outputs:

```sql
select ST_AsGeoJSON("retailers"."location") as "location", "retailers"."name" from "retailers" where ("retailers"."country"='United States' and "retailers"."state" != 'Texas') order by "name" asc
```