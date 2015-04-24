var exports = function(pjs) {
	
	pjs.selector('geojson', 'ST_AsGeoJSON');

};

// const data types
exports.DATA_TYPES = {

	// numeric
	smallint: {
		type: 'numeric',
		size: 2,
	},
	integer: {
		type: 'numeric',
		size: 4,
	},
	bigint: {
		type: 'numeric',
		size: 8,
	},
	decimal: {
		type: 'numeric',
	},
	numeric: {
		type: 'numeric',
	},
	real: {
		type: 'numeric',
		size: 4,
	},
	'double precision': {
		type: 'numeric',
		size: 8,
	},
	smallserial: {
		type: 'numeric',
		size: 2,
	},
	serial: {
		type: 'numeric',
		size: 4,
	},
	bigserial: {
		type: 'numeric',
		size: 8,
	},

	// numeric aliases
	int: {
		type: 'numeric',
		size: 4,
	},
	int2: {
		type: 'numeric',
		size: 2,
	},
	int4: {
		type: 'numeric',
		size: 4,
	},
	int8: {
		type: 'numeric',
		size: 8,
	},
	serial2: {
		type: 'numeric',
		size: 2,
	},
	serial4: {
		type: 'numeric',
		size: 4,
	},
	serial8: {
		type: 'numeric',
		size: 8,
	},
	float4: {
		type: 'numeric',
		size: 4,
	},
	float8: {
		type: 'numeric',
		size: 8,
	},

	// monetary
	money: {
		type: 'monetary',
		size: 8,
	},

	// character
	'character varying': {
		type: 'character',
	},
	varchar: {
		type: 'character',
	},
	character: {
		type: 'character',
	},
	char: {
		type: 'character',
	},
	text: {
		type: 'character',
	},

	// binary data
	bytea: {
		type: 'binary',
	},

	// date/time
	timestamp: {
		type: 'date/time',
		size: 8,
	},
	'timestamp with time zone': {
		type: 'date/time',
		size: 8,
	},
	'timestamp without time zone': {
		type: 'date/time',
		size: 8,
	},
	timestamptz: {
		type: 'date/time',
		size: 8,
	},
	date: {
		type: 'date/time',
		size: 4
	},
	time: {
		type: 'date/time',
		size: 8,
	},
	'time without time zone': {
		type: 'date/time',
		size: 8,
	},
	'time with time zone': {
		type: 'date/time',
		size: 12,
	},
	timetz: {
		type: 'date/time',
		size: 12,
	},
	interval: {
		type: 'date/time',
		size: 16,
	},

	// boolean
	boolean: {
		type: 'boolean',
		size: 1,
	},

	// enumerated types

	// geometric types
	point: {
		type: 'geometric',
		size: 16,
	},
	line: {
		type: 'geometric',
		size: 32,
	},
	lseg: {
		type: 'geometric',
		size: 32,
	},
	box: {
		type: 'geometric',
		size: 32,
	},
	path: {
		type: 'geometric',
	},
	polygon: {
		type: 'geometric',
	},
	circle: {
		type: 'geometric',
	},

	// network address
	cidr: {
		type: 'network',
		size: [7, 19],
	},
	inet: {
		type: 'network',
		size: [7, 19],
	},
	macaddr: {
		type: 'network',
		size: 6,
	},

	// bit string
	bit: {
		type: 'bit-string',
	},
	varbit: {
		type: 'bit-string',
	},

	// text search
	tsquery: {
		type: 'text-search',
	},
	tsvector: {
		type: 'text-search',
	},

	// uuid
	uuid: {
		type: 'uuid',
	},

	// xml
	xml: {
		type: 'xml',
	},

	// json
	json: {
		type: 'json',
	},

	// arrays

	// ranges
	int4range: {
		type: 'range',
		of: 'integer',
	},
	int8range: {
		type: 'range',
		of: 'bigint',
	},
	numrange: {
		type: 'range',
		of: 'numeric',
	},
	tsrange: {
		type: 'range',
		of: 'timestamp without time zone',
	},
	tstzrange: {
		type: 'range',
		of: 'timestamp with time zone',
	},
	daterange	: {
		type: 'range',
		of: 'date',
	},

	// object identifier
	oid: {
		type: 'object-identifier',
	},
	regproc: {
		type: 'object-identifier',
	},
	regprocedure: {
		type: 'object-identifier',
	},
	regoper: {
		type: 'object-identifier',
	},
	regoperator: {
		type: 'object-identifier',
	},
	regclass: {
		type: 'object-identifier',
	},
	regtype: {
		type: 'object-identifier',
	},
	regconfig: {
		type: 'object-identifier',
	},
	regdictionary: {
		type: 'object-identifier',
	},

	// other
	txid_snapshot: {
		type: 'snapshot',
	},
};


module.exports = exports;