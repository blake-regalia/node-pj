# node-pjs


## Install
```sh
$ npm install pj
```


## Examples

### Select

```javascript
var pj = require('pj');

pj.config({
	global: true,
});

pj.from('retailers')
    .select('name','location::geojson')
    .where({
        country: 'United States',
		state: pj('!=','Texas'),
	})
	.order('name')
	.dump();
```

outputs:

```sql
select ST_AsGeoJSON("retailers"."location") as "location", "retailers"."name" from "retailers" where ("retailers"."country"='United States' and "retailers"."state" != 'Texas') order by "name" asc
```