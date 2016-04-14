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
var R_CONNECT = /^\s*(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w+)?(:\d+)?\/)?(\w+)(\?.+)\s*$/;

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
	return '' + (m_connect[1] || H_CONNECT_DEFAULTS.protocol) + '://' + (m_connect[2] || H_CONNECT_DEFAULTS.user) + (m_connect[3] ? ':' + m_connect[3] : '') + '@' + (m_connect[4] || H_CONNECT_DEFAULTS.host) + (m_connect[5] || '') + '/' + m_connect[6] + (m_connect[7] || '');
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
//# sourceMappingURL=data:application/json;base64,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QUFRLFVBQVUsTUFBVixDQUFpQixPQUFqQixDQUFSOzs7QUFIUSxnQkFNWixDQUFhLEtBQWIsRUFBb0IsVUFBQyxRQUFELEVBQVcsUUFBWCxFQUF3Qjs7O0FBRzNDLFNBQUcsUUFBSCxFQUFhO0FBQ1osWUFBTSxJQUFOLENBQVcsUUFBWCxFQURZO01BQWI7OztBQUgyQyxTQVF4QyxlQUFlLE9BQU8sTUFBUCxFQUFlO0FBQ2hDLGFBQU8sUUFBUCxFQURnQztNQUFqQztLQVJtQixDQUFwQixDQU5ZO0lBMUREO0dBQVA7OztBQU53QixTQXNGdkIsSUFBUCxDQXRGOEI7RUFBYjs7O0FBdkU0QixRQWtLdkMsa0JBQVEsUUFBUixDQUFpQixZQUFXLEVBQVgsRUFFckI7Ozs7QUFHRixzQkFBSyxTQUFTO0FBQ2IsVUFBTyxVQUFVO0FBQ2hCLFVBQU0sT0FBTjtJQURNLENBQVAsQ0FEYTtHQUhaO0VBRkksQ0FBUCxDQWxLOEM7Q0FBbkIsQ0FBdEI7O2tCQStLUyIsImZpbGUiOiJwai5qcyIsInNvdXJjZXNDb250ZW50IjpbIlxuLy8gdGhpcmQtcGFydHkgbW9kdWxlc1xuaW1wb3J0IGNsYXNzZXIgZnJvbSAnY2xhc3Nlcic7XG5pbXBvcnQgcGcgZnJvbSAncGcnO1xuXG4vLyBsb2NhbCBjbGFzc2VzXG5cbi8qKlxuKiBzdGF0aWM6XG4qKi9cblxuLy8gY29ubmVjdGlvbiBzdHJpbmcgcmVnZXggcGFyc2VyXG5jb25zdCBSX0NPTk5FQ1QgPSAvXlxccyooPzooPzooPzooXFx3Kyk6XFwvXFwvKT8oXFx3KykoPzo6KFteQF0rKSk/QCk/KFxcdyspPyg6XFxkKyk/XFwvKT8oXFx3KykoXFw/LispXFxzKiQvO1xuXG4vLyBjb25uZWN0aW9uIGRlZmF1bHRzXG5jb25zdCBIX0NPTk5FQ1RfREVGQVVMVFMgPSB7XG5cdHByb3RvY29sOiAncG9zdGdyZXMnLFxuXHR1c2VyOiAncm9vdCcsXG5cdGhvc3Q6ICdsb2NhbGhvc3QnLFxufTtcblxuXG4vLyBjb25uZWN0IHRvIGRhdGFiYXNlIHVzaW5nIHN0cmluZ1xuY29uc3QgY29ubmVjdF9zdHJpbmcgPSAoc19jb25uZWN0KSA9PiB7XG5cblx0Ly8gcGFyc2UgY29ubmVjdGlvbiBzdHJpbmdcblx0dmFyIG1fY29ubmVjdCA9IFJfQ09OTkVDVC5leGVjKHNfY29ubmVjdCk7XG5cblx0Ly8gaW52YWxpZCBjb25uZWN0aW9uIHN0cmluZ1xuXHRpZighbV9jb25uZWN0KSByZXR1cm4gbG9jYWwuZmFpbChgaW52YWxpZCBjb25uZWN0aW9uIHN0cmluZzogXCIke3NfY29ubmVjdH1cImApO1xuXG5cdC8vIGNvbnN0cnVjdCBmdWxsIHBvc3RncmVzIGNvbm5lY3Rpb24gc3RyaW5nXG5cdHJldHVybiAnJ1xuXHRcdFx0KyhtX2Nvbm5lY3RbMV0gfHwgSF9DT05ORUNUX0RFRkFVTFRTLnByb3RvY29sKSsnOi8vJ1xuXHRcdFx0KyhtX2Nvbm5lY3RbMl0gfHwgSF9DT05ORUNUX0RFRkFVTFRTLnVzZXIpXG5cdFx0XHRcdCsobV9jb25uZWN0WzNdPyAnOicrbV9jb25uZWN0WzNdOiAnJylcblx0XHRcdCsnQCdcblx0XHRcdCsobV9jb25uZWN0WzRdIHx8IEhfQ09OTkVDVF9ERUZBVUxUUy5ob3N0KVxuXHRcdFx0XHQrKG1fY29ubmVjdFs1XSB8fCAnJylcblx0XHRcdCsnLydcblx0XHRcdCttX2Nvbm5lY3RbNl1cblx0XHRcdCsobV9jb25uZWN0WzddIHx8ICcnKTtcbn07XG5cbi8vIGVzY2FwZSBzdHJpbmcgbGl0ZXJhbFxuY29uc3QgZXNjYXBlX2xpdGVyYWwgPSAoc192YWx1ZSkgPT4ge1xuXHRyZXR1cm4gc192YWx1ZVxuXHRcdC5yZXBsYWNlKC8nL2csICdcXCdcXCcnKVxuXHRcdC5yZXBsYWNlKC9cXHQvZywgJ1xcXFx0Jylcblx0XHQucmVwbGFjZSgvXFxuL2csICdcXFxcbicpO1xufTtcblxuLy9cbmNvbnN0IHZhbHVpZnkgPSAoel92YWx1ZSkgPT4ge1xuXHRzd2l0Y2godHlwZW9mIHpfdmFsdWUpIHtcblx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0cmV0dXJuIGAnJHtlc2NhcGVfbGl0ZXJhbCh6X3ZhbHVlKX0nYDtcblxuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRyZXR1cm4gel92YWx1ZTtcblxuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIHpfdmFsdWU/ICdUUlVFJzogJ0ZBTFNFJztcblxuXHRcdGNhc2UgJ29iamVjdCc6XG5cdFx0XHQvLyBudWxsXG5cdFx0XHRpZihudWxsID09PSB6X3ZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcmF3IHNxbFxuXHRcdFx0ZWxzZSBpZignc3RyaW5nJyA9PT0gdHlwZW9mIHpfdmFsdWUucmF3KSB7XG5cdFx0XHRcdHJldHVybiB6X3ZhbHVlLnJhdztcblx0XHRcdH1cblxuXHRcdFx0Ly8gZGVmYXVsdFxuXHRcdFx0cmV0dXJuIGVzY2FwZV9saXRlcmFsKFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeSh6X3ZhbHVlKVxuXHRcdFx0KTtcblxuXHRcdGNhc2UgJ2Z1bmN0aW9uJzpcblx0XHRcdHJldHVybiB6X3ZhbHVlKCkrJyc7XG5cblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgJ3VuYWJsZSB0byBjb252ZXJ0IGludG8gc2FmZSB2YWx1ZTogXCIke3pfdmFsdWV9XCInO1xuXHR9XG59O1xuXG4vLyBcbmNvbnN0IEhfV1JJVEVSUyA9IHtcblxuXHQvLyBjb252ZXJ0IGhhc2ggcXVlcnkgdG8gc3RyaW5nIHF1ZXJ5XG5cdGluc2VydChoX3F1ZXJ5KSB7XG5cblx0XHQvLyByZWYgaW5zZXJ0IGxpc3Rcblx0XHRsZXQgYV9pbnNlcnRzID0gaF9xdWVyeS5pbnNlcnQ7XG5cblx0XHQvLyBwcmVwIGxpc3Qgb2Ygcm93cyB0aGF0IGhhdmUgYmVlbiBvYnNlcnZlZCBmcm9tIGZpcnN0IGVsZW1lbnRcblx0XHRsZXQgYV9rZXlzID0gT2JqZWN0LmtleXMoYV9pbnNlcnRzWzBdKTtcblxuXHRcdC8vIGJ1aWxkIGNvbHVtbnMgcGFydCBvZiBzcWwgc3RyaW5nXG5cdFx0bGV0IHNfa2V5cyA9IGFfa2V5cy5tYXAoc19rZXkgPT4gYFwiJHtzX2tleX1cImApLmpvaW4oJywnKTtcblxuXHRcdC8vIGJ1aWxkIHZhbHVlcyBwYXJ0IG9mIHNxbCBzdHJpbmdcblx0XHRsZXQgYV9yb3dzID0gW107XG5cblx0XHQvLyBlYWNoIGluc2VydCByb3dcblx0XHRhX2luc2VydHMuZm9yRWFjaCgoaF9yb3cpID0+IHtcblxuXHRcdFx0Ly8gbGlzdCBvZiB2YWx1ZXMgdG8gaW5zZXJ0IGZvciB0aGlzIHJvd1xuXHRcdFx0bGV0IGFfdmFsdWVzID0gW107XG5cblx0XHRcdC8vIGVhY2gga2V5LXZhbHVlIHBhaXIgaW4gcm93XG5cdFx0XHRmb3IobGV0IHNfa2V5IGluIGhfcm93KSB7XG5cblx0XHRcdFx0Ly8ga2V5IGlzIG1pc3NpbmcgZnJvbSBhY2NlcHRlZCB2YWx1ZXMgc2VjdGlvblxuXHRcdFx0XHRpZigtMSA9PT0gYV9rZXlzLmluZGV4T2Yoc19rZXkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsLmZhaWwoJ25ldyBrZXkgXCIke3Nfa2V5fVwiIGludHJvZHVjZWQgYWZ0ZXIgZmlyc3QgZWxlbWVudCBpbiBpbnNlcnQgY2hhaW4nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGFwcGVuZCB0byB2YWx1ZXNcblx0XHRcdFx0YV92YWx1ZXMucHVzaCh2YWx1aWZ5KGhfcm93W3Nfa2V5XSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBwdXNoIHJvdyB0byB2YWx1ZXMgbGlzdFxuXHRcdFx0YV9yb3dzLnB1c2goYCgke2FfdmFsdWVzLmpvaW4oJywnKX0pYCk7XG5cdFx0fSk7XG5cblx0XHQvL1xuXHRcdGxldCBzX3RhaWwgPSAnJztcblxuXHRcdC8vXG5cdFx0aWYoaF9xdWVyeS5jb25mbGljdF90YXJnZXQgJiYgaF9xdWVyeS5jb25mbGljdF9hY3Rpb24pIHtcblx0XHRcdHNfdGFpbCArPSBgb24gY29uZmxpY3QgJHtoX3F1ZXJ5LmNvbmZsaWN0X3RhcmdldH0gJHtoX3F1ZXJ5LmNvbmZsaWN0X2FjdGlvbn1gO1xuXHRcdH1cblxuXHRcdC8vIHByZXAgc3FsIHF1ZXJ5IHN0cmluZ1xuXHRcdHJldHVybiBgaW5zZXJ0IGludG8gXCIke2hfcXVlcnkuaW50b31cIiAoJHtzX2tleXN9KSB2YWx1ZXMgJHthX3Jvd3Muam9pbignLCcpfSAke3NfdGFpbH1gO1xuXHR9LFxufTtcblxuXG5cbi8qKlxuKiBjbGFzczpcbioqL1xuY29uc3QgbG9jYWwgPSBjbGFzc2VyKCdwaicsIGZ1bmN0aW9uKHpfY29uZmlnKSB7XG5cblx0Ly9cblx0bGV0IGFfcXVldWUgPSBbXTtcblxuXHQvLyBjb25uZWN0aW9uIHN0cmluZ1xuXHRsZXQgc19jb25uZWN0aW9uID0gKCgpID0+IHtcblxuXHRcdC8vIHNldHVwIHBvc3RncmVzIGNvbm5lY3Rpb25cblx0XHRzd2l0Y2godHlwZW9mIHpfY29uZmlnKSB7XG5cblx0XHRcdC8vIGNvbmZpZyBnaXZlbiBhcyBzdHJpbmdcblx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRcdC8vIGNvbm5lY3Rpb24gc3RyaW5nXG5cdFx0XHRcdHJldHVybiBjb25uZWN0X3N0cmluZyh6X2NvbmZpZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KSgpO1xuXG5cdC8vXG5cdGlmKCFzX2Nvbm5lY3Rpb24pIHJldHVybiBsb2NhbC5mYWlsKCdmYWlsZWQgdG8gdW5kZXJzdGFuZCBjb25uZWN0aW9uIGNvbmZpZyBhcmd1bWVudCcpO1xuXG5cdC8vXG5cdGxvY2FsLmluZm8oYGNvbm5lY3RpbmcgdG8gcG9zdGdyZXMgdy8gJHtzX2Nvbm5lY3Rpb259YCk7XG5cblx0Ly8gcG9zdGdyZXMgY2xpZW50XG5cdGxldCB5X2NsaWVudCA9IG5ldyBwZy5DbGllbnQoc19jb25uZWN0aW9uKTtcblxuXHQvLyBpbml0aWF0ZSBjb25uZWN0aW9uXG5cdHlfY2xpZW50LmNvbm5lY3QoKGVfY29ubmVjdCkgPT4ge1xuXG5cdFx0Ly8gY29ubmVjdGlvbiBlcnJvclxuXHRcdGlmKGVfY29ubmVjdCkge1xuXHRcdFx0bG9jYWwuZmFpbCgnZmFpbGVkIHRvIGNvbm5lY3QnKTtcblx0XHR9XG5cblx0XHQvLyBcblx0XHRuZXh0X3F1ZXJ5KCk7XG5cdH0pO1xuXG5cdC8vXG5cdGNvbnN0IG5leHRfcXVlcnkgPSAoKSA9PiB7XG5cblx0XHQvLyBxdWV1ZSBpcyBub3QgZW1wdHlcblx0XHRpZihhX3F1ZXVlLmxlbmd0aCkge1xuXHRcdFx0Ly8gc2hpZnQgZmlyc3QgcXVlcnkgZnJvbSBiZWdpbm5pbmdcblx0XHRcdGxldCBoX3F1ZXJ5ID0gYV9xdWV1ZS5zaGlmdCgpO1xuXG5cdFx0XHQvLyBleGVjdXRlIHF1ZXJ5XG5cdFx0XHR5X2NsaWVudC5xdWVyeShoX3F1ZXJ5LnNxbCwgaF9xdWVyeS5jYWxsYmFjayk7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIHN1Ym1pdCBhIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkXG5cdGNvbnN0IHN1Ym1pdF9xdWVyeSA9IChzX3F1ZXJ5LCBmX29rYXkpID0+IHtcblxuXHRcdC8vIHB1c2ggdG8gcXVldWVcblx0XHRhX3F1ZXVlLnB1c2goe1xuXHRcdFx0c3FsOiBzX3F1ZXJ5LFxuXHRcdFx0Y2FsbGJhY2s6IGZfb2theSxcblx0XHR9KTtcblxuXHRcdC8vIHF1ZXVlIHdhcyBlbXB0eVxuXHRcdGlmKDEgPT09IGFfcXVldWUubGVuZ3RoKSB7XG5cdFx0XHQvLyBpbml0aWF0ZVxuXHRcdFx0bmV4dF9xdWVyeSgpO1xuXHRcdH1cblx0fTtcblxuXHQvLyBxdWVyeS1idWlsZGluZyBmb3IgaW5zZXJ0aW9uXG5cdGNvbnN0IHFiX2luc2VydCA9IChoX3F1ZXJ5KSA9PiB7XG5cblx0XHQvLyBkZWZhdWx0IGluc2VydCBoYXNoXG5cdFx0aF9xdWVyeS5pbnNlcnQgPSBoX3F1ZXJ5Lmluc2VydCB8fCBbXTtcblxuXHRcdC8vXG5cdFx0Y29uc3Qgc2VsZiA9IHtcblxuXHRcdFx0Ly8gaW5zZXJ0IHJvd3Ncblx0XHRcdGluc2VydCh6X3ZhbHVlcykge1xuXG5cdFx0XHRcdC8vIGxpc3Qgb2Ygcm93cyB0byBpbnNlcnQgc2ltdWx0YW5lb3VzbHlcblx0XHRcdFx0aWYoQXJyYXkuaXNBcnJheSh6X3ZhbHVlcykpIHtcblxuXHRcdFx0XHRcdC8vIGFwcGVuZCB0byBleGlzdGluZyBpbnNlcnRpb24gbGlzdFxuXHRcdFx0XHRcdGhfcXVlcnkuaW5zZXJ0LnB1c2goLi4uel92YWx1ZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHZhbHVlcyBoYXNoXG5cdFx0XHRcdGVsc2UgaWYoJ29iamVjdCcgPT09IHR5cGVvZiB6X3ZhbHVlcykge1xuXG5cdFx0XHRcdFx0Ly8gc2luZ2xlIHJvdyB0byBhcHBlbmQgdG8gaW5zZXJ0aW9uIGxpc3Rcblx0XHRcdFx0XHRoX3F1ZXJ5Lmluc2VydC5wdXNoKHpfdmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBvdGhlciB0eXBlXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGxvY2FsLmZhaWwoJ2ludmFsaWQgdHlwZSBmb3IgaW5zZXJ0aW9uIGFyZ3VtZW50Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBub3JtYWwgaW5zZXJ0IGFjdGlvbnNcblx0XHRcdFx0cmV0dXJuIHNlbGY7XG5cdFx0XHR9LFxuXG5cdFx0XHQvLyBvbiBjb25mbGljdFxuXHRcdFx0b25fY29uZmxpY3Qoc190YXJnZXQpIHtcblxuXHRcdFx0XHQvLyBzZXQgY29uZmxpY3QgdGFyZ2V0XG5cdFx0XHRcdGhfcXVlcnkuY29uZmxpY3RfdGFyZ2V0ID0gYCgke3NfdGFyZ2V0fSlgO1xuXG5cdFx0XHRcdC8vIG5leHQgYWN0aW9uIGhhc2hcblx0XHRcdFx0cmV0dXJuIHtcblxuXHRcdFx0XHRcdC8vIGRvIG5vdGhpbmdcblx0XHRcdFx0XHRkb19ub3RoaW5nKCkge1xuXG5cdFx0XHRcdFx0XHQvLyBzZXQgY29uZmxpY3QgYWN0aW9uXG5cdFx0XHRcdFx0XHRoX3F1ZXJ5LmNvbmZsaWN0X2FjdGlvbiA9ICdkbyBub3RoaW5nJztcblxuXHRcdFx0XHRcdFx0Ly8gbm9ybWFsIGluc2VydCBhY3Rpb25zXG5cdFx0XHRcdFx0XHRyZXR1cm4gc2VsZjtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblxuXHRcdFx0Ly9cblx0XHRcdGRlYnVnKCkge1xuXG5cdFx0XHRcdC8vIGdlbmVyYXRlIHNxbFxuXHRcdFx0XHRsZXQgc19zcWwgPSBIX1dSSVRFUlMuaW5zZXJ0KGhfcXVlcnkpO1xuXG5cdFx0XHRcdGRlYnVnZ2VyO1xuXHRcdFx0XHRyZXR1cm4gc2VsZjtcblx0XHRcdH0sXG5cblx0XHRcdC8vXG5cdFx0XHRleGVjKGZfb2theSkge1xuXG5cdFx0XHRcdC8vIGdlbmVyYXRlIHNxbFxuXHRcdFx0XHRsZXQgc19zcWwgPSBIX1dSSVRFUlMuaW5zZXJ0KGhfcXVlcnkpO1xuXG5cdFx0XHRcdC8vIHN1Ym1pdFxuXHRcdFx0XHRzdWJtaXRfcXVlcnkoc19zcWwsIChlX2luc2VydCwgd19yZXN1bHQpID0+IHtcblxuXHRcdFx0XHRcdC8vIGluc2VydCBlcnJvclxuXHRcdFx0XHRcdGlmKGVfaW5zZXJ0KSB7XG5cdFx0XHRcdFx0XHRsb2NhbC5mYWlsKGVfaW5zZXJ0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdGlmKCdmdW5jdGlvbicgPT09IHR5cGVvZiBmX29rYXkpIHtcblx0XHRcdFx0XHRcdGZfb2theSh3X3Jlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vXG5cdFx0cmV0dXJuIHNlbGY7XG5cdH07XG5cblxuXHQvL1xuXHRyZXR1cm4gY2xhc3Nlci5vcGVyYXRvcihmdW5jdGlvbigpIHtcblxuXHR9LCB7XG5cblx0XHQvLyBzdGFydCBvZiBhbiBpbnNlcnQgcXVlcnlcblx0XHRpbnRvKHNfdGFibGUpIHtcblx0XHRcdHJldHVybiBxYl9pbnNlcnQoe1xuXHRcdFx0XHRpbnRvOiBzX3RhYmxlLFxuXHRcdFx0fSk7XG5cdFx0fSxcblx0fSk7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgbG9jYWw7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
