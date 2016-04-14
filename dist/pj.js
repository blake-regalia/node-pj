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
var R_CONNECT = /^\s*(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w+)?\/)?(\w+)\s*$/;

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
	return '' + (m_connect[1] || H_CONNECT_DEFAULTS.protocol) + '://' + (m_connect[2] || H_CONNECT_DEFAULTS.user) + (m_connect[3] ? ':' + m_connect[3] : '') + '@' + (m_connect[4] || H_CONNECT_DEFAULTS.host) + '/' + m_connect[5];
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
//# sourceMappingURL=data:application/json;base64,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QUMsUUFBRCxFQUFXLFFBQVgsRUFBd0I7OztBQUczQyxTQUFHLFFBQUgsRUFBYTtBQUNaLFlBQU0sSUFBTixDQUFXLFFBQVgsRUFEWTtNQUFiOzs7QUFIMkMsU0FReEMsZUFBZSxPQUFPLE1BQVAsRUFBZTtBQUNoQyxhQUFPLFFBQVAsRUFEZ0M7TUFBakM7S0FSbUIsQ0FBcEIsQ0FOWTtJQTFERDtHQUFQOzs7QUFOd0IsU0FzRnZCLElBQVAsQ0F0RjhCO0VBQWI7OztBQXZFNEIsUUFrS3ZDLGtCQUFRLFFBQVIsQ0FBaUIsWUFBVyxFQUFYLEVBRXJCOzs7O0FBR0Ysc0JBQUssU0FBUztBQUNiLFVBQU8sVUFBVTtBQUNoQixVQUFNLE9BQU47SUFETSxDQUFQLENBRGE7R0FIWjtFQUZJLENBQVAsQ0FsSzhDO0NBQW5CLENBQXRCOztrQkErS1MiLCJmaWxlIjoicGouanMiLCJzb3VyY2VzQ29udGVudCI6WyJcbi8vIHRoaXJkLXBhcnR5IG1vZHVsZXNcbmltcG9ydCBjbGFzc2VyIGZyb20gJ2NsYXNzZXInO1xuaW1wb3J0IHBnIGZyb20gJ3BnJztcblxuLy8gbG9jYWwgY2xhc3Nlc1xuXG4vKipcbiogc3RhdGljOlxuKiovXG5cbi8vIGNvbm5lY3Rpb24gc3RyaW5nIHJlZ2V4IHBhcnNlclxuY29uc3QgUl9DT05ORUNUID0gL15cXHMqKD86KD86KD86KFxcdyspOlxcL1xcLyk/KFxcdyspKD86OihbXkBdKykpP0ApPyhcXHcrKT9cXC8pPyhcXHcrKVxccyokLztcblxuLy8gY29ubmVjdGlvbiBkZWZhdWx0c1xuY29uc3QgSF9DT05ORUNUX0RFRkFVTFRTID0ge1xuXHRwcm90b2NvbDogJ3Bvc3RncmVzJyxcblx0dXNlcjogJ3Jvb3QnLFxuXHRob3N0OiAnbG9jYWxob3N0Jyxcbn07XG5cblxuLy8gY29ubmVjdCB0byBkYXRhYmFzZSB1c2luZyBzdHJpbmdcbmNvbnN0IGNvbm5lY3Rfc3RyaW5nID0gKHNfY29ubmVjdCkgPT4ge1xuXG5cdC8vIHBhcnNlIGNvbm5lY3Rpb24gc3RyaW5nXG5cdHZhciBtX2Nvbm5lY3QgPSBSX0NPTk5FQ1QuZXhlYyhzX2Nvbm5lY3QpO1xuXG5cdC8vIGludmFsaWQgY29ubmVjdGlvbiBzdHJpbmdcblx0aWYoIW1fY29ubmVjdCkgcmV0dXJuIGxvY2FsLmZhaWwoYGludmFsaWQgY29ubmVjdGlvbiBzdHJpbmc6IFwiJHtzX2Nvbm5lY3R9XCJgKTtcblxuXHQvLyBjb25zdHJ1Y3QgZnVsbCBwb3N0Z3JlcyBjb25uZWN0aW9uIHN0cmluZ1xuXHRyZXR1cm4gJydcblx0XHRcdCsobV9jb25uZWN0WzFdIHx8IEhfQ09OTkVDVF9ERUZBVUxUUy5wcm90b2NvbCkrJzovLydcblx0XHRcdCsobV9jb25uZWN0WzJdIHx8IEhfQ09OTkVDVF9ERUZBVUxUUy51c2VyKVxuXHRcdFx0XHQrKG1fY29ubmVjdFszXT8gJzonK21fY29ubmVjdFszXTogJycpXG5cdFx0XHQrJ0AnXG5cdFx0XHQrKG1fY29ubmVjdFs0XSB8fCBIX0NPTk5FQ1RfREVGQVVMVFMuaG9zdCkrJy8nXG5cdFx0XHQrbV9jb25uZWN0WzVdO1xufTtcblxuLy8gZXNjYXBlIHN0cmluZyBsaXRlcmFsXG5jb25zdCBlc2NhcGVfbGl0ZXJhbCA9IChzX3ZhbHVlKSA9PiB7XG5cdHJldHVybiBzX3ZhbHVlXG5cdFx0LnJlcGxhY2UoLycvZywgJ1xcJ1xcJycpXG5cdFx0LnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKVxuXHRcdC5yZXBsYWNlKC9cXG4vZywgJ1xcXFxuJyk7XG59O1xuXG4vL1xuY29uc3QgdmFsdWlmeSA9ICh6X3ZhbHVlKSA9PiB7XG5cdHN3aXRjaCh0eXBlb2Ygel92YWx1ZSkge1xuXHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRyZXR1cm4gYCcke2VzY2FwZV9saXRlcmFsKHpfdmFsdWUpfSdgO1xuXG5cdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdHJldHVybiB6X3ZhbHVlO1xuXG5cdFx0Y2FzZSAnYm9vbGVhbic6XG5cdFx0XHRyZXR1cm4gel92YWx1ZT8gJ1RSVUUnOiAnRkFMU0UnO1xuXG5cdFx0Y2FzZSAnb2JqZWN0Jzpcblx0XHRcdC8vIG51bGxcblx0XHRcdGlmKG51bGwgPT09IHpfdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHQvLyByYXcgc3FsXG5cdFx0XHRlbHNlIGlmKCdzdHJpbmcnID09PSB0eXBlb2Ygel92YWx1ZS5yYXcpIHtcblx0XHRcdFx0cmV0dXJuIHpfdmFsdWUucmF3O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkZWZhdWx0XG5cdFx0XHRyZXR1cm4gZXNjYXBlX2xpdGVyYWwoXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHpfdmFsdWUpXG5cdFx0XHQpO1xuXG5cdFx0Y2FzZSAnZnVuY3Rpb24nOlxuXHRcdFx0cmV0dXJuIHpfdmFsdWUoKSsnJztcblxuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyAndW5hYmxlIHRvIGNvbnZlcnQgaW50byBzYWZlIHZhbHVlOiBcIiR7el92YWx1ZX1cIic7XG5cdH1cbn07XG5cbi8vIFxuY29uc3QgSF9XUklURVJTID0ge1xuXG5cdC8vIGNvbnZlcnQgaGFzaCBxdWVyeSB0byBzdHJpbmcgcXVlcnlcblx0aW5zZXJ0KGhfcXVlcnkpIHtcblxuXHRcdC8vIHJlZiBpbnNlcnQgbGlzdFxuXHRcdGxldCBhX2luc2VydHMgPSBoX3F1ZXJ5Lmluc2VydDtcblxuXHRcdC8vIHByZXAgbGlzdCBvZiByb3dzIHRoYXQgaGF2ZSBiZWVuIG9ic2VydmVkIGZyb20gZmlyc3QgZWxlbWVudFxuXHRcdGxldCBhX2tleXMgPSBPYmplY3Qua2V5cyhhX2luc2VydHNbMF0pO1xuXG5cdFx0Ly8gYnVpbGQgY29sdW1ucyBwYXJ0IG9mIHNxbCBzdHJpbmdcblx0XHRsZXQgc19rZXlzID0gYV9rZXlzLm1hcChzX2tleSA9PiBgXCIke3Nfa2V5fVwiYCkuam9pbignLCcpO1xuXG5cdFx0Ly8gYnVpbGQgdmFsdWVzIHBhcnQgb2Ygc3FsIHN0cmluZ1xuXHRcdGxldCBhX3Jvd3MgPSBbXTtcblxuXHRcdC8vIGVhY2ggaW5zZXJ0IHJvd1xuXHRcdGFfaW5zZXJ0cy5mb3JFYWNoKChoX3JvdykgPT4ge1xuXG5cdFx0XHQvLyBsaXN0IG9mIHZhbHVlcyB0byBpbnNlcnQgZm9yIHRoaXMgcm93XG5cdFx0XHRsZXQgYV92YWx1ZXMgPSBbXTtcblxuXHRcdFx0Ly8gZWFjaCBrZXktdmFsdWUgcGFpciBpbiByb3dcblx0XHRcdGZvcihsZXQgc19rZXkgaW4gaF9yb3cpIHtcblxuXHRcdFx0XHQvLyBrZXkgaXMgbWlzc2luZyBmcm9tIGFjY2VwdGVkIHZhbHVlcyBzZWN0aW9uXG5cdFx0XHRcdGlmKC0xID09PSBhX2tleXMuaW5kZXhPZihzX2tleSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWwuZmFpbCgnbmV3IGtleSBcIiR7c19rZXl9XCIgaW50cm9kdWNlZCBhZnRlciBmaXJzdCBlbGVtZW50IGluIGluc2VydCBjaGFpbicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gYXBwZW5kIHRvIHZhbHVlc1xuXHRcdFx0XHRhX3ZhbHVlcy5wdXNoKHZhbHVpZnkoaF9yb3dbc19rZXldKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHB1c2ggcm93IHRvIHZhbHVlcyBsaXN0XG5cdFx0XHRhX3Jvd3MucHVzaChgKCR7YV92YWx1ZXMuam9pbignLCcpfSlgKTtcblx0XHR9KTtcblxuXHRcdC8vXG5cdFx0bGV0IHNfdGFpbCA9ICcnO1xuXG5cdFx0Ly9cblx0XHRpZihoX3F1ZXJ5LmNvbmZsaWN0X3RhcmdldCAmJiBoX3F1ZXJ5LmNvbmZsaWN0X2FjdGlvbikge1xuXHRcdFx0c190YWlsICs9IGBvbiBjb25mbGljdCAke2hfcXVlcnkuY29uZmxpY3RfdGFyZ2V0fSAke2hfcXVlcnkuY29uZmxpY3RfYWN0aW9ufWA7XG5cdFx0fVxuXG5cdFx0Ly8gcHJlcCBzcWwgcXVlcnkgc3RyaW5nXG5cdFx0cmV0dXJuIGBpbnNlcnQgaW50byBcIiR7aF9xdWVyeS5pbnRvfVwiICgke3Nfa2V5c30pIHZhbHVlcyAke2Ffcm93cy5qb2luKCcsJyl9ICR7c190YWlsfWA7XG5cdH0sXG59O1xuXG5cblxuLyoqXG4qIGNsYXNzOlxuKiovXG5jb25zdCBsb2NhbCA9IGNsYXNzZXIoJ3BqJywgZnVuY3Rpb24oel9jb25maWcpIHtcblxuXHQvL1xuXHRsZXQgYV9xdWV1ZSA9IFtdO1xuXG5cdC8vIGNvbm5lY3Rpb24gc3RyaW5nXG5cdGxldCBzX2Nvbm5lY3Rpb24gPSAoKCkgPT4ge1xuXG5cdFx0Ly8gc2V0dXAgcG9zdGdyZXMgY29ubmVjdGlvblxuXHRcdHN3aXRjaCh0eXBlb2Ygel9jb25maWcpIHtcblxuXHRcdFx0Ly8gY29uZmlnIGdpdmVuIGFzIHN0cmluZ1xuXHRcdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdFx0Ly8gY29ubmVjdGlvbiBzdHJpbmdcblx0XHRcdFx0cmV0dXJuIGNvbm5lY3Rfc3RyaW5nKHpfY29uZmlnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pKCk7XG5cblx0Ly9cblx0aWYoIXNfY29ubmVjdGlvbikgcmV0dXJuIGxvY2FsLmZhaWwoJ2ZhaWxlZCB0byB1bmRlcnN0YW5kIGNvbm5lY3Rpb24gY29uZmlnIGFyZ3VtZW50Jyk7XG5cblx0Ly9cblx0bG9jYWwuaW5mbyhgY29ubmVjdGluZyB0byBwb3N0Z3JlcyB3LyAke3NfY29ubmVjdGlvbn1gKTtcblxuXHQvLyBwb3N0Z3JlcyBjbGllbnRcblx0bGV0IHlfY2xpZW50ID0gbmV3IHBnLkNsaWVudChzX2Nvbm5lY3Rpb24pO1xuXG5cdC8vIGluaXRpYXRlIGNvbm5lY3Rpb25cblx0eV9jbGllbnQuY29ubmVjdCgoZV9jb25uZWN0KSA9PiB7XG5cblx0XHQvLyBjb25uZWN0aW9uIGVycm9yXG5cdFx0aWYoZV9jb25uZWN0KSB7XG5cdFx0XHRsb2NhbC5mYWlsKCdmYWlsZWQgdG8gY29ubmVjdCcpO1xuXHRcdH1cblxuXHRcdC8vIFxuXHRcdG5leHRfcXVlcnkoKTtcblx0fSk7XG5cblx0Ly9cblx0Y29uc3QgbmV4dF9xdWVyeSA9ICgpID0+IHtcblxuXHRcdC8vIHF1ZXVlIGlzIG5vdCBlbXB0eVxuXHRcdGlmKGFfcXVldWUubGVuZ3RoKSB7XG5cdFx0XHQvLyBzaGlmdCBmaXJzdCBxdWVyeSBmcm9tIGJlZ2lubmluZ1xuXHRcdFx0bGV0IGhfcXVlcnkgPSBhX3F1ZXVlLnNoaWZ0KCk7XG5cblx0XHRcdC8vIGV4ZWN1dGUgcXVlcnlcblx0XHRcdHlfY2xpZW50LnF1ZXJ5KGhfcXVlcnkuc3FsLCBoX3F1ZXJ5LmNhbGxiYWNrKTtcblx0XHR9XG5cdH07XG5cblx0Ly8gc3VibWl0IGEgcXVlcnkgdG8gYmUgZXhlY3V0ZWRcblx0Y29uc3Qgc3VibWl0X3F1ZXJ5ID0gKHNfcXVlcnksIGZfb2theSkgPT4ge1xuXG5cdFx0Ly8gcHVzaCB0byBxdWV1ZVxuXHRcdGFfcXVldWUucHVzaCh7XG5cdFx0XHRzcWw6IHNfcXVlcnksXG5cdFx0XHRjYWxsYmFjazogZl9va2F5LFxuXHRcdH0pO1xuXG5cdFx0Ly8gcXVldWUgd2FzIGVtcHR5XG5cdFx0aWYoMSA9PT0gYV9xdWV1ZS5sZW5ndGgpIHtcblx0XHRcdC8vIGluaXRpYXRlXG5cdFx0XHRuZXh0X3F1ZXJ5KCk7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIHF1ZXJ5LWJ1aWxkaW5nIGZvciBpbnNlcnRpb25cblx0Y29uc3QgcWJfaW5zZXJ0ID0gKGhfcXVlcnkpID0+IHtcblxuXHRcdC8vIGRlZmF1bHQgaW5zZXJ0IGhhc2hcblx0XHRoX3F1ZXJ5Lmluc2VydCA9IGhfcXVlcnkuaW5zZXJ0IHx8IFtdO1xuXG5cdFx0Ly9cblx0XHRjb25zdCBzZWxmID0ge1xuXG5cdFx0XHQvLyBpbnNlcnQgcm93c1xuXHRcdFx0aW5zZXJ0KHpfdmFsdWVzKSB7XG5cblx0XHRcdFx0Ly8gbGlzdCBvZiByb3dzIHRvIGluc2VydCBzaW11bHRhbmVvdXNseVxuXHRcdFx0XHRpZihBcnJheS5pc0FycmF5KHpfdmFsdWVzKSkge1xuXG5cdFx0XHRcdFx0Ly8gYXBwZW5kIHRvIGV4aXN0aW5nIGluc2VydGlvbiBsaXN0XG5cdFx0XHRcdFx0aF9xdWVyeS5pbnNlcnQucHVzaCguLi56X3ZhbHVlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gdmFsdWVzIGhhc2hcblx0XHRcdFx0ZWxzZSBpZignb2JqZWN0JyA9PT0gdHlwZW9mIHpfdmFsdWVzKSB7XG5cblx0XHRcdFx0XHQvLyBzaW5nbGUgcm93IHRvIGFwcGVuZCB0byBpbnNlcnRpb24gbGlzdFxuXHRcdFx0XHRcdGhfcXVlcnkuaW5zZXJ0LnB1c2goel92YWx1ZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIG90aGVyIHR5cGVcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bG9jYWwuZmFpbCgnaW52YWxpZCB0eXBlIGZvciBpbnNlcnRpb24gYXJndW1lbnQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG5vcm1hbCBpbnNlcnQgYWN0aW9uc1xuXHRcdFx0XHRyZXR1cm4gc2VsZjtcblx0XHRcdH0sXG5cblx0XHRcdC8vIG9uIGNvbmZsaWN0XG5cdFx0XHRvbl9jb25mbGljdChzX3RhcmdldCkge1xuXG5cdFx0XHRcdC8vIHNldCBjb25mbGljdCB0YXJnZXRcblx0XHRcdFx0aF9xdWVyeS5jb25mbGljdF90YXJnZXQgPSBgKCR7c190YXJnZXR9KWA7XG5cblx0XHRcdFx0Ly8gbmV4dCBhY3Rpb24gaGFzaFxuXHRcdFx0XHRyZXR1cm4ge1xuXG5cdFx0XHRcdFx0Ly8gZG8gbm90aGluZ1xuXHRcdFx0XHRcdGRvX25vdGhpbmcoKSB7XG5cblx0XHRcdFx0XHRcdC8vIHNldCBjb25mbGljdCBhY3Rpb25cblx0XHRcdFx0XHRcdGhfcXVlcnkuY29uZmxpY3RfYWN0aW9uID0gJ2RvIG5vdGhpbmcnO1xuXG5cdFx0XHRcdFx0XHQvLyBub3JtYWwgaW5zZXJ0IGFjdGlvbnNcblx0XHRcdFx0XHRcdHJldHVybiBzZWxmO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXG5cdFx0XHQvL1xuXHRcdFx0ZGVidWcoKSB7XG5cblx0XHRcdFx0Ly8gZ2VuZXJhdGUgc3FsXG5cdFx0XHRcdGxldCBzX3NxbCA9IEhfV1JJVEVSUy5pbnNlcnQoaF9xdWVyeSk7XG5cblx0XHRcdFx0ZGVidWdnZXI7XG5cdFx0XHRcdHJldHVybiBzZWxmO1xuXHRcdFx0fSxcblxuXHRcdFx0Ly9cblx0XHRcdGV4ZWMoZl9va2F5KSB7XG5cblx0XHRcdFx0Ly8gZ2VuZXJhdGUgc3FsXG5cdFx0XHRcdGxldCBzX3NxbCA9IEhfV1JJVEVSUy5pbnNlcnQoaF9xdWVyeSk7XG5cblx0XHRcdFx0Ly8gc3VibWl0XG5cdFx0XHRcdHN1Ym1pdF9xdWVyeShzX3NxbCwgKGVfaW5zZXJ0LCB3X3Jlc3VsdCkgPT4ge1xuXG5cdFx0XHRcdFx0Ly8gaW5zZXJ0IGVycm9yXG5cdFx0XHRcdFx0aWYoZV9pbnNlcnQpIHtcblx0XHRcdFx0XHRcdGxvY2FsLmZhaWwoZV9pbnNlcnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0aWYoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZfb2theSkge1xuXHRcdFx0XHRcdFx0Zl9va2F5KHdfcmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly9cblx0XHRyZXR1cm4gc2VsZjtcblx0fTtcblxuXG5cdC8vXG5cdHJldHVybiBjbGFzc2VyLm9wZXJhdG9yKGZ1bmN0aW9uKCkge1xuXG5cdH0sIHtcblxuXHRcdC8vIHN0YXJ0IG9mIGFuIGluc2VydCBxdWVyeVxuXHRcdGludG8oc190YWJsZSkge1xuXHRcdFx0cmV0dXJuIHFiX2luc2VydCh7XG5cdFx0XHRcdGludG86IHNfdGFibGUsXG5cdFx0XHR9KTtcblx0XHR9LFxuXHR9KTtcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBsb2NhbDtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
