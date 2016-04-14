
// third-party modules
import classer from 'classer';
import pg from 'pg';

// local classes

/**
* static:
**/

// connection string regex parser
const R_CONNECT = /^\s*(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w+)?\/)?(\w+)(\?.+)\s*$/;

// connection defaults
const H_CONNECT_DEFAULTS = {
	protocol: 'postgres',
	user: 'root',
	host: 'localhost',
};


// connect to database using string
const connect_string = (s_connect) => {

	// parse connection string
	var m_connect = R_CONNECT.exec(s_connect);

	// invalid connection string
	if(!m_connect) return local.fail(`invalid connection string: "${s_connect}"`);

	// construct full postgres connection string
	return ''
			+(m_connect[1] || H_CONNECT_DEFAULTS.protocol)+'://'
			+(m_connect[2] || H_CONNECT_DEFAULTS.user)
				+(m_connect[3]? ':'+m_connect[3]: '')
			+'@'
			+(m_connect[4] || H_CONNECT_DEFAULTS.host)+'/'
			+m_connect[5]
			+(m_connect[6] || '');
};

// escape string literal
const escape_literal = (s_value) => {
	return s_value
		.replace(/'/g, '\'\'')
		.replace(/\t/g, '\\t')
		.replace(/\n/g, '\\n');
};

//
const valuify = (z_value) => {
	switch(typeof z_value) {
		case 'string':
			return `'${escape_literal(z_value)}'`;

		case 'number':
			return z_value;

		case 'boolean':
			return z_value? 'TRUE': 'FALSE';

		case 'object':
			// null
			if(null === z_value) {
				return null;
			}
			// raw sql
			else if('string' === typeof z_value.raw) {
				return z_value.raw;
			}

			// default
			return escape_literal(
				JSON.stringify(z_value)
			);

		case 'function':
			return z_value()+'';

		default:
			throw 'unable to convert into safe value: "${z_value}"';
	}
};

// 
const H_WRITERS = {

	// convert hash query to string query
	insert(h_query) {

		// ref insert list
		let a_inserts = h_query.insert;

		// prep list of rows that have been observed from first element
		let a_keys = Object.keys(a_inserts[0]);

		// build columns part of sql string
		let s_keys = a_keys.map(s_key => `"${s_key}"`).join(',');

		// build values part of sql string
		let a_rows = [];

		// each insert row
		a_inserts.forEach((h_row) => {

			// list of values to insert for this row
			let a_values = [];

			// each key-value pair in row
			for(let s_key in h_row) {

				// key is missing from accepted values section
				if(-1 === a_keys.indexOf(s_key)) {
					return local.fail('new key "${s_key}" introduced after first element in insert chain');
				}

				// append to values
				a_values.push(valuify(h_row[s_key]));
			}

			// push row to values list
			a_rows.push(`(${a_values.join(',')})`);
		});

		//
		let s_tail = '';

		//
		if(h_query.conflict_target && h_query.conflict_action) {
			s_tail += `on conflict ${h_query.conflict_target} ${h_query.conflict_action}`;
		}

		// prep sql query string
		return `insert into "${h_query.into}" (${s_keys}) values ${a_rows.join(',')} ${s_tail}`;
	},
};



/**
* class:
**/
const local = classer('pj', function(z_config) {

	//
	let a_queue = [];

	// connection string
	let s_connection = (() => {

		// setup postgres connection
		switch(typeof z_config) {

			// config given as string
			case 'string':
				// connection string
				return connect_string(z_config);
		}

		return false;
	})();

	//
	if(!s_connection) return local.fail('failed to understand connection config argument');

	//
	local.info(`connecting to postgres w/ ${s_connection}`);

	// postgres client
	let y_client = new pg.Client(s_connection);

	// initiate connection
	y_client.connect((e_connect) => {

		// connection error
		if(e_connect) {
			local.fail('failed to connect');
		}

		// 
		next_query();
	});

	//
	const next_query = () => {

		// queue is not empty
		if(a_queue.length) {
			// shift first query from beginning
			let h_query = a_queue.shift();

			// execute query
			y_client.query(h_query.sql, h_query.callback);
		}
	};

	// submit a query to be executed
	const submit_query = (s_query, f_okay) => {

		// push to queue
		a_queue.push({
			sql: s_query,
			callback: f_okay,
		});

		// queue was empty
		if(1 === a_queue.length) {
			// initiate
			next_query();
		}
	};

	// query-building for insertion
	const qb_insert = (h_query) => {

		// default insert hash
		h_query.insert = h_query.insert || [];

		//
		const self = {

			// insert rows
			insert(z_values) {

				// list of rows to insert simultaneously
				if(Array.isArray(z_values)) {

					// append to existing insertion list
					h_query.insert.push(...z_values);
				}
				// values hash
				else if('object' === typeof z_values) {

					// single row to append to insertion list
					h_query.insert.push(z_values);
				}
				// other type
				else {
					local.fail('invalid type for insertion argument');
				}

				// normal insert actions
				return self;
			},

			// on conflict
			on_conflict(s_target) {

				// set conflict target
				h_query.conflict_target = `(${s_target})`;

				// next action hash
				return {

					// do nothing
					do_nothing() {

						// set conflict action
						h_query.conflict_action = 'do nothing';

						// normal insert actions
						return self;
					},
				};
			},

			//
			debug() {

				// generate sql
				let s_sql = H_WRITERS.insert(h_query);

				debugger;
				return self;
			},

			//
			exec(f_okay) {

				// generate sql
				let s_sql = H_WRITERS.insert(h_query);

				// submit
				submit_query(s_sql, (e_insert, w_result) => {

					// insert error
					if(e_insert) {
						local.fail(e_insert);
					}

					//
					if('function' === typeof f_okay) {
						f_okay(w_result);
					}
				});
			},
		};

		//
		return self;
	};


	//
	return classer.operator(function() {

	}, {

		// start of an insert query
		into(s_table) {
			return qb_insert({
				into: s_table,
			});
		},
	});
});

export default local;
