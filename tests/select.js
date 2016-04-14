var pj = require('../lib/index2');

var db = new pj();

pj.alias("epoch_ms($tz='UTC')", "extract(epoch from $0 as time zone '$tz') * 1000");



	[
		'time::epoch_ms',
		'js_time=time::epoch_ms',
		'js_time=time::epoch_ms()',
		'js_time=time::epoch_ms(PST)',
	];


db.from('test')
	.select('time::epoch_ms')
	.dump();

db.from('test')
	.select('js_time=time::epoch_ms')
	.dump();

db.from('test')
	.select('js_time=time::epoch_ms()')
	.dump();

db.from('test')
	.select('js_time=time::epoch_ms(PST)')
	.dump();


.select('lastName, firstName','($age yr old $sex)');
.select('#@city')