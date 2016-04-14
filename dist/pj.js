'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };
// third-party modules


var _classer = require('classer');

var _classer2 = _interopRequireDefault(_classer);

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// local classes

/**
* static:
**/

// connection string regex parser
var R_CONNECT = /^\s*(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w+)?\/)?(\w+)(\?.+)\s*$/;

// connection defaults
var H_CONNECT_DEFAULTS = {
	protocol: 'postgres',
	user: 'root',
	host: 'localhost'
};

// connect to database using string
var connect_string = function connect_string(s_connect) {

	// parse connection string
	var m_connect = R_CONNECT.exec(s_connect);

	// invalid connection string
	if (!m_connect) return local.fail('invalid connection string: "' + s_connect + '"');

	// construct full postgres connection string
	return '' + (m_connect[1] || H_CONNECT_DEFAULTS.protocol) + '://' + (m_connect[2] || H_CONNECT_DEFAULTS.user) + (m_connect[3] ? ':' + m_connect[3] : '') + '@' + (m_connect[4] || H_CONNECT_DEFAULTS.host) + '/' + m_connect[5] + (m_connect[6] || '');
};

// escape string literal
var escape_literal = function escape_literal(s_value) {
	return s_value.replace(/'/g, '\'\'').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
};

//
var valuify = function valuify(z_value) {
	switch (typeof z_value === 'undefined' ? 'undefined' : _typeof(z_value)) {
		case 'string':
			return '\'' + escape_literal(z_value) + '\'';

		case 'number':
			return z_value;

		case 'boolean':
			return z_value ? 'TRUE' : 'FALSE';

		case 'object':
			// null
			if (null === z_value) {
				return null;
			}
			// raw sql
			else if ('string' === typeof z_value.raw) {
					return z_value.raw;
				}

			// default
			return escape_literal(JSON.stringify(z_value));

		case 'function':
			return z_value() + '';

		default:
			throw 'unable to convert into safe value: "${z_value}"';
	}
};

//
var H_WRITERS = {

	// convert hash query to string query

	insert: function insert(h_query) {

		// ref insert list
		var a_inserts = h_query.insert;

		// prep list of rows that have been observed from first element
		var a_keys = Object.keys(a_inserts[0]);

		// build columns part of sql string
		var s_keys = a_keys.map(function (s_key) {
			return '"' + s_key + '"';
		}).join(',');

		// build values part of sql string
		var a_rows = [];

		// each insert row
		a_inserts.forEach(function (h_row) {

			// list of values to insert for this row
			var a_values = [];

			// each key-value pair in row
			for (var s_key in h_row) {

				// key is missing from accepted values section
				if (-1 === a_keys.indexOf(s_key)) {
					return local.fail('new key "${s_key}" introduced after first element in insert chain');
				}

				// append to values
				a_values.push(valuify(h_row[s_key]));
			}

			// push row to values list
			a_rows.push('(' + a_values.join(',') + ')');
		});

		//
		var s_tail = '';

		//
		if (h_query.conflict_target && h_query.conflict_action) {
			s_tail += 'on conflict ' + h_query.conflict_target + ' ' + h_query.conflict_action;
		}

		// prep sql query string
		return 'insert into "' + h_query.into + '" (' + s_keys + ') values ' + a_rows.join(',') + ' ' + s_tail;
	}
};

/**
* class:
**/
var local = (0, _classer2.default)('pj', function (z_config) {

	//
	var a_queue = [];

	// connection string
	var s_connection = function () {

		// setup postgres connection
		switch (typeof z_config === 'undefined' ? 'undefined' : _typeof(z_config)) {

			// config given as string
			case 'string':
				// connection string
				return connect_string(z_config);
		}

		return false;
	}();

	//
	if (!s_connection) return local.fail('failed to understand connection config argument');

	//
	local.info('connecting to postgres w/ ' + s_connection);

	// postgres client
	var y_client = new _pg2.default.Client(s_connection);

	// initiate connection
	y_client.connect(function (e_connect) {

		// connection error
		if (e_connect) {
			local.fail('failed to connect');
		}

		//
		next_query();
	});

	//
	var next_query = function next_query() {

		// queue is not empty
		if (a_queue.length) {
			// shift first query from beginning
			var h_query = a_queue.shift();

			// execute query
			y_client.query(h_query.sql, h_query.callback);
		}
	};

	// submit a query to be executed
	var submit_query = function submit_query(s_query, f_okay) {

		// push to queue
		a_queue.push({
			sql: s_query,
			callback: f_okay
		});

		// queue was empty
		if (1 === a_queue.length) {
			// initiate
			next_query();
		}
	};

	// query-building for insertion
	var qb_insert = function qb_insert(h_query) {

		// default insert hash
		h_query.insert = h_query.insert || [];

		//
		var self = {

			// insert rows

			insert: function insert(z_values) {

				// list of rows to insert simultaneously
				if (Array.isArray(z_values)) {
					var _h_query$insert;

					// append to existing insertion list
					(_h_query$insert = h_query.insert).push.apply(_h_query$insert, _toConsumableArray(z_values));
				}
				// values hash
				else if ('object' === (typeof z_values === 'undefined' ? 'undefined' : _typeof(z_values))) {

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
			on_conflict: function on_conflict(s_target) {

				// set conflict target
				h_query.conflict_target = '(' + s_target + ')';

				// next action hash
				return {

					// do nothing

					do_nothing: function do_nothing() {

						// set conflict action
						h_query.conflict_action = 'do nothing';

						// normal insert actions
						return self;
					}
				};
			},


			//
			debug: function debug() {

				// generate sql
				var s_sql = H_WRITERS.insert(h_query);

				debugger;
				return self;
			},


			//
			exec: function exec(f_okay) {

				// generate sql
				var s_sql = H_WRITERS.insert(h_query);

				// submit
				submit_query(s_sql, function (e_insert, w_result) {

					// insert error
					if (e_insert) {
						local.fail(e_insert);
					}

					//
					if ('function' === typeof f_okay) {
						f_okay(w_result);
					}
				});
			}
		};

		//
		return self;
	};

	//
	return _classer2.default.operator(function () {}, {

		// start of an insert query

		into: function into(s_table) {
			return qb_insert({
				into: s_table
			});
		}
	});
});

exports.default = local;
//# sourceMappingURL=data:application/json;base64,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Ozs7QUFIUSxnQkFNWixDQUFhLEtBQWIsRUFBb0IsVUFBQyxRQUFELEVBQVcsUUFBWCxFQUF3Qjs7O0FBRzNDLFNBQUcsUUFBSCxFQUFhO0FBQ1osWUFBTSxJQUFOLENBQVcsUUFBWCxFQURZO01BQWI7OztBQUgyQyxTQVF4QyxlQUFlLE9BQU8sTUFBUCxFQUFlO0FBQ2hDLGFBQU8sUUFBUCxFQURnQztNQUFqQztLQVJtQixDQUFwQixDQU5ZO0lBMUREO0dBQVA7OztBQU53QixTQXNGdkIsSUFBUCxDQXRGOEI7RUFBYjs7O0FBdkU0QixRQWtLdkMsa0JBQVEsUUFBUixDQUFpQixZQUFXLEVBQVgsRUFFckI7Ozs7QUFHRixzQkFBSyxTQUFTO0FBQ2IsVUFBTyxVQUFVO0FBQ2hCLFVBQU0sT0FBTjtJQURNLENBQVAsQ0FEYTtHQUhaO0VBRkksQ0FBUCxDQWxLOEM7Q0FBbkIsQ0FBdEI7O2tCQStLUyIsImZpbGUiOiJwai5qcyIsInNvdXJjZXNDb250ZW50IjpbIlxuLy8gdGhpcmQtcGFydHkgbW9kdWxlc1xuaW1wb3J0IGNsYXNzZXIgZnJvbSAnY2xhc3Nlcic7XG5pbXBvcnQgcGcgZnJvbSAncGcnO1xuXG4vLyBsb2NhbCBjbGFzc2VzXG5cbi8qKlxuKiBzdGF0aWM6XG4qKi9cblxuLy8gY29ubmVjdGlvbiBzdHJpbmcgcmVnZXggcGFyc2VyXG5jb25zdCBSX0NPTk5FQ1QgPSAvXlxccyooPzooPzooPzooXFx3Kyk6XFwvXFwvKT8oXFx3KykoPzo6KFteQF0rKSk/QCk/KFxcdyspP1xcLyk/KFxcdyspKFxcPy4rKVxccyokLztcblxuLy8gY29ubmVjdGlvbiBkZWZhdWx0c1xuY29uc3QgSF9DT05ORUNUX0RFRkFVTFRTID0ge1xuXHRwcm90b2NvbDogJ3Bvc3RncmVzJyxcblx0dXNlcjogJ3Jvb3QnLFxuXHRob3N0OiAnbG9jYWxob3N0Jyxcbn07XG5cblxuLy8gY29ubmVjdCB0byBkYXRhYmFzZSB1c2luZyBzdHJpbmdcbmNvbnN0IGNvbm5lY3Rfc3RyaW5nID0gKHNfY29ubmVjdCkgPT4ge1xuXG5cdC8vIHBhcnNlIGNvbm5lY3Rpb24gc3RyaW5nXG5cdHZhciBtX2Nvbm5lY3QgPSBSX0NPTk5FQ1QuZXhlYyhzX2Nvbm5lY3QpO1xuXG5cdC8vIGludmFsaWQgY29ubmVjdGlvbiBzdHJpbmdcblx0aWYoIW1fY29ubmVjdCkgcmV0dXJuIGxvY2FsLmZhaWwoYGludmFsaWQgY29ubmVjdGlvbiBzdHJpbmc6IFwiJHtzX2Nvbm5lY3R9XCJgKTtcblxuXHQvLyBjb25zdHJ1Y3QgZnVsbCBwb3N0Z3JlcyBjb25uZWN0aW9uIHN0cmluZ1xuXHRyZXR1cm4gJydcblx0XHRcdCsobV9jb25uZWN0WzFdIHx8IEhfQ09OTkVDVF9ERUZBVUxUUy5wcm90b2NvbCkrJzovLydcblx0XHRcdCsobV9jb25uZWN0WzJdIHx8IEhfQ09OTkVDVF9ERUZBVUxUUy51c2VyKVxuXHRcdFx0XHQrKG1fY29ubmVjdFszXT8gJzonK21fY29ubmVjdFszXTogJycpXG5cdFx0XHQrJ0AnXG5cdFx0XHQrKG1fY29ubmVjdFs0XSB8fCBIX0NPTk5FQ1RfREVGQVVMVFMuaG9zdCkrJy8nXG5cdFx0XHQrbV9jb25uZWN0WzVdXG5cdFx0XHQrKG1fY29ubmVjdFs2XSB8fCAnJyk7XG59O1xuXG4vLyBlc2NhcGUgc3RyaW5nIGxpdGVyYWxcbmNvbnN0IGVzY2FwZV9saXRlcmFsID0gKHNfdmFsdWUpID0+IHtcblx0cmV0dXJuIHNfdmFsdWVcblx0XHQucmVwbGFjZSgvJy9nLCAnXFwnXFwnJylcblx0XHQucmVwbGFjZSgvXFx0L2csICdcXFxcdCcpXG5cdFx0LnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKTtcbn07XG5cbi8vXG5jb25zdCB2YWx1aWZ5ID0gKHpfdmFsdWUpID0+IHtcblx0c3dpdGNoKHR5cGVvZiB6X3ZhbHVlKSB7XG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdHJldHVybiBgJyR7ZXNjYXBlX2xpdGVyYWwoel92YWx1ZSl9J2A7XG5cblx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0cmV0dXJuIHpfdmFsdWU7XG5cblx0XHRjYXNlICdib29sZWFuJzpcblx0XHRcdHJldHVybiB6X3ZhbHVlPyAnVFJVRSc6ICdGQUxTRSc7XG5cblx0XHRjYXNlICdvYmplY3QnOlxuXHRcdFx0Ly8gbnVsbFxuXHRcdFx0aWYobnVsbCA9PT0gel92YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdC8vIHJhdyBzcWxcblx0XHRcdGVsc2UgaWYoJ3N0cmluZycgPT09IHR5cGVvZiB6X3ZhbHVlLnJhdykge1xuXHRcdFx0XHRyZXR1cm4gel92YWx1ZS5yYXc7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdHJldHVybiBlc2NhcGVfbGl0ZXJhbChcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoel92YWx1ZSlcblx0XHRcdCk7XG5cblx0XHRjYXNlICdmdW5jdGlvbic6XG5cdFx0XHRyZXR1cm4gel92YWx1ZSgpKycnO1xuXG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93ICd1bmFibGUgdG8gY29udmVydCBpbnRvIHNhZmUgdmFsdWU6IFwiJHt6X3ZhbHVlfVwiJztcblx0fVxufTtcblxuLy8gXG5jb25zdCBIX1dSSVRFUlMgPSB7XG5cblx0Ly8gY29udmVydCBoYXNoIHF1ZXJ5IHRvIHN0cmluZyBxdWVyeVxuXHRpbnNlcnQoaF9xdWVyeSkge1xuXG5cdFx0Ly8gcmVmIGluc2VydCBsaXN0XG5cdFx0bGV0IGFfaW5zZXJ0cyA9IGhfcXVlcnkuaW5zZXJ0O1xuXG5cdFx0Ly8gcHJlcCBsaXN0IG9mIHJvd3MgdGhhdCBoYXZlIGJlZW4gb2JzZXJ2ZWQgZnJvbSBmaXJzdCBlbGVtZW50XG5cdFx0bGV0IGFfa2V5cyA9IE9iamVjdC5rZXlzKGFfaW5zZXJ0c1swXSk7XG5cblx0XHQvLyBidWlsZCBjb2x1bW5zIHBhcnQgb2Ygc3FsIHN0cmluZ1xuXHRcdGxldCBzX2tleXMgPSBhX2tleXMubWFwKHNfa2V5ID0+IGBcIiR7c19rZXl9XCJgKS5qb2luKCcsJyk7XG5cblx0XHQvLyBidWlsZCB2YWx1ZXMgcGFydCBvZiBzcWwgc3RyaW5nXG5cdFx0bGV0IGFfcm93cyA9IFtdO1xuXG5cdFx0Ly8gZWFjaCBpbnNlcnQgcm93XG5cdFx0YV9pbnNlcnRzLmZvckVhY2goKGhfcm93KSA9PiB7XG5cblx0XHRcdC8vIGxpc3Qgb2YgdmFsdWVzIHRvIGluc2VydCBmb3IgdGhpcyByb3dcblx0XHRcdGxldCBhX3ZhbHVlcyA9IFtdO1xuXG5cdFx0XHQvLyBlYWNoIGtleS12YWx1ZSBwYWlyIGluIHJvd1xuXHRcdFx0Zm9yKGxldCBzX2tleSBpbiBoX3Jvdykge1xuXG5cdFx0XHRcdC8vIGtleSBpcyBtaXNzaW5nIGZyb20gYWNjZXB0ZWQgdmFsdWVzIHNlY3Rpb25cblx0XHRcdFx0aWYoLTEgPT09IGFfa2V5cy5pbmRleE9mKHNfa2V5KSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbC5mYWlsKCduZXcga2V5IFwiJHtzX2tleX1cIiBpbnRyb2R1Y2VkIGFmdGVyIGZpcnN0IGVsZW1lbnQgaW4gaW5zZXJ0IGNoYWluJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBhcHBlbmQgdG8gdmFsdWVzXG5cdFx0XHRcdGFfdmFsdWVzLnB1c2godmFsdWlmeShoX3Jvd1tzX2tleV0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcHVzaCByb3cgdG8gdmFsdWVzIGxpc3Rcblx0XHRcdGFfcm93cy5wdXNoKGAoJHthX3ZhbHVlcy5qb2luKCcsJyl9KWApO1xuXHRcdH0pO1xuXG5cdFx0Ly9cblx0XHRsZXQgc190YWlsID0gJyc7XG5cblx0XHQvL1xuXHRcdGlmKGhfcXVlcnkuY29uZmxpY3RfdGFyZ2V0ICYmIGhfcXVlcnkuY29uZmxpY3RfYWN0aW9uKSB7XG5cdFx0XHRzX3RhaWwgKz0gYG9uIGNvbmZsaWN0ICR7aF9xdWVyeS5jb25mbGljdF90YXJnZXR9ICR7aF9xdWVyeS5jb25mbGljdF9hY3Rpb259YDtcblx0XHR9XG5cblx0XHQvLyBwcmVwIHNxbCBxdWVyeSBzdHJpbmdcblx0XHRyZXR1cm4gYGluc2VydCBpbnRvIFwiJHtoX3F1ZXJ5LmludG99XCIgKCR7c19rZXlzfSkgdmFsdWVzICR7YV9yb3dzLmpvaW4oJywnKX0gJHtzX3RhaWx9YDtcblx0fSxcbn07XG5cblxuXG4vKipcbiogY2xhc3M6XG4qKi9cbmNvbnN0IGxvY2FsID0gY2xhc3NlcigncGonLCBmdW5jdGlvbih6X2NvbmZpZykge1xuXG5cdC8vXG5cdGxldCBhX3F1ZXVlID0gW107XG5cblx0Ly8gY29ubmVjdGlvbiBzdHJpbmdcblx0bGV0IHNfY29ubmVjdGlvbiA9ICgoKSA9PiB7XG5cblx0XHQvLyBzZXR1cCBwb3N0Z3JlcyBjb25uZWN0aW9uXG5cdFx0c3dpdGNoKHR5cGVvZiB6X2NvbmZpZykge1xuXG5cdFx0XHQvLyBjb25maWcgZ2l2ZW4gYXMgc3RyaW5nXG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHQvLyBjb25uZWN0aW9uIHN0cmluZ1xuXHRcdFx0XHRyZXR1cm4gY29ubmVjdF9zdHJpbmcoel9jb25maWcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fSkoKTtcblxuXHQvL1xuXHRpZighc19jb25uZWN0aW9uKSByZXR1cm4gbG9jYWwuZmFpbCgnZmFpbGVkIHRvIHVuZGVyc3RhbmQgY29ubmVjdGlvbiBjb25maWcgYXJndW1lbnQnKTtcblxuXHQvL1xuXHRsb2NhbC5pbmZvKGBjb25uZWN0aW5nIHRvIHBvc3RncmVzIHcvICR7c19jb25uZWN0aW9ufWApO1xuXG5cdC8vIHBvc3RncmVzIGNsaWVudFxuXHRsZXQgeV9jbGllbnQgPSBuZXcgcGcuQ2xpZW50KHNfY29ubmVjdGlvbik7XG5cblx0Ly8gaW5pdGlhdGUgY29ubmVjdGlvblxuXHR5X2NsaWVudC5jb25uZWN0KChlX2Nvbm5lY3QpID0+IHtcblxuXHRcdC8vIGNvbm5lY3Rpb24gZXJyb3Jcblx0XHRpZihlX2Nvbm5lY3QpIHtcblx0XHRcdGxvY2FsLmZhaWwoJ2ZhaWxlZCB0byBjb25uZWN0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gXG5cdFx0bmV4dF9xdWVyeSgpO1xuXHR9KTtcblxuXHQvL1xuXHRjb25zdCBuZXh0X3F1ZXJ5ID0gKCkgPT4ge1xuXG5cdFx0Ly8gcXVldWUgaXMgbm90IGVtcHR5XG5cdFx0aWYoYV9xdWV1ZS5sZW5ndGgpIHtcblx0XHRcdC8vIHNoaWZ0IGZpcnN0IHF1ZXJ5IGZyb20gYmVnaW5uaW5nXG5cdFx0XHRsZXQgaF9xdWVyeSA9IGFfcXVldWUuc2hpZnQoKTtcblxuXHRcdFx0Ly8gZXhlY3V0ZSBxdWVyeVxuXHRcdFx0eV9jbGllbnQucXVlcnkoaF9xdWVyeS5zcWwsIGhfcXVlcnkuY2FsbGJhY2spO1xuXHRcdH1cblx0fTtcblxuXHQvLyBzdWJtaXQgYSBxdWVyeSB0byBiZSBleGVjdXRlZFxuXHRjb25zdCBzdWJtaXRfcXVlcnkgPSAoc19xdWVyeSwgZl9va2F5KSA9PiB7XG5cblx0XHQvLyBwdXNoIHRvIHF1ZXVlXG5cdFx0YV9xdWV1ZS5wdXNoKHtcblx0XHRcdHNxbDogc19xdWVyeSxcblx0XHRcdGNhbGxiYWNrOiBmX29rYXksXG5cdFx0fSk7XG5cblx0XHQvLyBxdWV1ZSB3YXMgZW1wdHlcblx0XHRpZigxID09PSBhX3F1ZXVlLmxlbmd0aCkge1xuXHRcdFx0Ly8gaW5pdGlhdGVcblx0XHRcdG5leHRfcXVlcnkoKTtcblx0XHR9XG5cdH07XG5cblx0Ly8gcXVlcnktYnVpbGRpbmcgZm9yIGluc2VydGlvblxuXHRjb25zdCBxYl9pbnNlcnQgPSAoaF9xdWVyeSkgPT4ge1xuXG5cdFx0Ly8gZGVmYXVsdCBpbnNlcnQgaGFzaFxuXHRcdGhfcXVlcnkuaW5zZXJ0ID0gaF9xdWVyeS5pbnNlcnQgfHwgW107XG5cblx0XHQvL1xuXHRcdGNvbnN0IHNlbGYgPSB7XG5cblx0XHRcdC8vIGluc2VydCByb3dzXG5cdFx0XHRpbnNlcnQoel92YWx1ZXMpIHtcblxuXHRcdFx0XHQvLyBsaXN0IG9mIHJvd3MgdG8gaW5zZXJ0IHNpbXVsdGFuZW91c2x5XG5cdFx0XHRcdGlmKEFycmF5LmlzQXJyYXkoel92YWx1ZXMpKSB7XG5cblx0XHRcdFx0XHQvLyBhcHBlbmQgdG8gZXhpc3RpbmcgaW5zZXJ0aW9uIGxpc3Rcblx0XHRcdFx0XHRoX3F1ZXJ5Lmluc2VydC5wdXNoKC4uLnpfdmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyB2YWx1ZXMgaGFzaFxuXHRcdFx0XHRlbHNlIGlmKCdvYmplY3QnID09PSB0eXBlb2Ygel92YWx1ZXMpIHtcblxuXHRcdFx0XHRcdC8vIHNpbmdsZSByb3cgdG8gYXBwZW5kIHRvIGluc2VydGlvbiBsaXN0XG5cdFx0XHRcdFx0aF9xdWVyeS5pbnNlcnQucHVzaCh6X3ZhbHVlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gb3RoZXIgdHlwZVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRsb2NhbC5mYWlsKCdpbnZhbGlkIHR5cGUgZm9yIGluc2VydGlvbiBhcmd1bWVudCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gbm9ybWFsIGluc2VydCBhY3Rpb25zXG5cdFx0XHRcdHJldHVybiBzZWxmO1xuXHRcdFx0fSxcblxuXHRcdFx0Ly8gb24gY29uZmxpY3Rcblx0XHRcdG9uX2NvbmZsaWN0KHNfdGFyZ2V0KSB7XG5cblx0XHRcdFx0Ly8gc2V0IGNvbmZsaWN0IHRhcmdldFxuXHRcdFx0XHRoX3F1ZXJ5LmNvbmZsaWN0X3RhcmdldCA9IGAoJHtzX3RhcmdldH0pYDtcblxuXHRcdFx0XHQvLyBuZXh0IGFjdGlvbiBoYXNoXG5cdFx0XHRcdHJldHVybiB7XG5cblx0XHRcdFx0XHQvLyBkbyBub3RoaW5nXG5cdFx0XHRcdFx0ZG9fbm90aGluZygpIHtcblxuXHRcdFx0XHRcdFx0Ly8gc2V0IGNvbmZsaWN0IGFjdGlvblxuXHRcdFx0XHRcdFx0aF9xdWVyeS5jb25mbGljdF9hY3Rpb24gPSAnZG8gbm90aGluZyc7XG5cblx0XHRcdFx0XHRcdC8vIG5vcm1hbCBpbnNlcnQgYWN0aW9uc1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNlbGY7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cblx0XHRcdC8vXG5cdFx0XHRkZWJ1ZygpIHtcblxuXHRcdFx0XHQvLyBnZW5lcmF0ZSBzcWxcblx0XHRcdFx0bGV0IHNfc3FsID0gSF9XUklURVJTLmluc2VydChoX3F1ZXJ5KTtcblxuXHRcdFx0XHRkZWJ1Z2dlcjtcblx0XHRcdFx0cmV0dXJuIHNlbGY7XG5cdFx0XHR9LFxuXG5cdFx0XHQvL1xuXHRcdFx0ZXhlYyhmX29rYXkpIHtcblxuXHRcdFx0XHQvLyBnZW5lcmF0ZSBzcWxcblx0XHRcdFx0bGV0IHNfc3FsID0gSF9XUklURVJTLmluc2VydChoX3F1ZXJ5KTtcblxuXHRcdFx0XHQvLyBzdWJtaXRcblx0XHRcdFx0c3VibWl0X3F1ZXJ5KHNfc3FsLCAoZV9pbnNlcnQsIHdfcmVzdWx0KSA9PiB7XG5cblx0XHRcdFx0XHQvLyBpbnNlcnQgZXJyb3Jcblx0XHRcdFx0XHRpZihlX2luc2VydCkge1xuXHRcdFx0XHRcdFx0bG9jYWwuZmFpbChlX2luc2VydCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHRpZignZnVuY3Rpb24nID09PSB0eXBlb2YgZl9va2F5KSB7XG5cdFx0XHRcdFx0XHRmX29rYXkod19yZXN1bHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHQvL1xuXHRcdHJldHVybiBzZWxmO1xuXHR9O1xuXG5cblx0Ly9cblx0cmV0dXJuIGNsYXNzZXIub3BlcmF0b3IoZnVuY3Rpb24oKSB7XG5cblx0fSwge1xuXG5cdFx0Ly8gc3RhcnQgb2YgYW4gaW5zZXJ0IHF1ZXJ5XG5cdFx0aW50byhzX3RhYmxlKSB7XG5cdFx0XHRyZXR1cm4gcWJfaW5zZXJ0KHtcblx0XHRcdFx0aW50bzogc190YWJsZSxcblx0XHRcdH0pO1xuXHRcdH0sXG5cdH0pO1xufSk7XG5cbmV4cG9ydCBkZWZhdWx0IGxvY2FsO1xuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
