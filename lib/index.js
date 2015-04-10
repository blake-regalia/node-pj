var defaults = require(__dirname+'/defaults');

/**
* class Postgres
**/
(function() {

	/**
	* private static:
	**/
	var __class = 'Postgres';
	var __env_nodejs = false;

	var __namespace, __exportee, __name;

	// node
	if(typeof module !== 'undefined' && module.exports) {
		__namespace = global;
		__exportee = module;
		__name = 'exports';
		__env_nodejs = true;
	}

	// browser
	else {
		__namespace = __exportee = window;
		__name = __class;
	}

	var d_global_instance = false;


	// escape string bits
	var esc = function(s_value) {
		return s_value
			// .replace(/(['\\])/g, '\\$1')
			.replace(/'/g,"''")
			.replace(/\t/g, '\\t')
			.replace(/\n/g, '\\n');
	};

	// value
	var valufy = function(z_value) {
		var s_type = typeof z_value;
		if('string' == s_type) {
			return "'"+esc(z_value)+"'";
		}
		else if('number' == s_type) {
			return z_value;
		}
		else if('boolean' == s_type) {
			return z_value? 'TRUE': 'FALSE';
		}
		else if('object' == s_type) {

			// null
			if(z_value === null) {
				return null;
			}
			// raw sql
			else if('string' === typeof z_value.raw) {
				return z_value.raw;
			}
			else {
				return esc(
					JSON.stringify(z_value)
				);
			}
		}
		else if('function' == s_type) {
			return z_value()+'';
		}
		else {
			throw new Error('unable to valuefy "'+z_value+'"');
		}
	};


	// helper method to renderers
	var render_helper = function(a_results) {
		return {
			each: function(f_each) {
				for(var i=a_results.length-1; i>=0; i--) {
					f_each.apply({}, [a_results[i], i]);
				}
			},
		};
	};


	var __construct = function(z_config) {
		
		/**
		* private:
		**/

		// for queueing pending queries
		var b_ready = __env_nodejs? false: true;
		var a_queries = [];

		// client proxy
		var y_proxy;
		var f_close_proxy;

		// user-defined specials
		var h_fkeys = {};
		var h_select_fns = {};
		var h_renderers = {};

		// configs
		var s_connection = '';
		var s_endpoint_url = '';


		// connect to database using string
		var connect_string = (function() {

			// regex constant
			var R_CONNECT = /^(?:(?:(?:(\w+):\/\/)?(\w+)@)?(\w+)\/)?(\w+)$/;

			// defaults
			var H_DEFAULTS = {
				protocol: 'postgres',
				user: 'root',
				host: 'localhost',
			};

			// parse function
			return function(s_connect) {

				// parse connection string
				var m_connect = R_CONNECT.exec(s_connect);
				if(!m_connect) exports.fail('invalid connection string: "'+s_connect+'"');
				return ''
						+(m_connect[1] || H_DEFAULTS.protocol)+'://'
						+(m_connect[2] || H_DEFAULTS.user)+'@'
						+(m_connect[3] || H_DEFAULTS.host)+'/'
						+m_connect[4];
			};
		})();


		// setup 
		(function() {

			var s_config_type = typeof z_config;

			// config type
			switch(s_config_type) {

				// string
				case 'string':

					// just the connection string
					s_connection = connect_string(z_config);
					break;

				// hash of config
				case 'object':

					// connect to database
					if(z_config.connect) {
						var z_connect = z_config.connect;

						// simple string
						if('string' == typeof z_connect) {
							s_connection = connect_string(z_connect);
						}
						else if('object' == typeof z_connect && !(z_connect instanceof Array)) {
							if(!z_connect.database) exports.fail('must specify a database');
							s_connection = ''
								+(z_connect.proto || 'postgres://')
								+(z_connect.user || 'root')
								+(z_connect.pass? ':'+z_connect.pass: '')
								+(z_connect.host? '@'+z_connect.host: '@localhost')
								+'/'+z_connect.database;
						}
					}

					// set endpoint
					if(z_config.endpoint) {
						s_endpoint_url = z_config.endpoint;
					}

					// nodejs
					if(__env_nodejs) {

						// use proxy module
						if(z_config.using) {
							(new z_config.using(s_connection)).connect(function(err, y_client, f_close) {
								if(err) exports.fail(err);
								y_proxy = y_client;
								f_close_proxy = f_close;
								next_query(function() {
									b_ready = true;
								});
							});
						}
					}
					break;
			}
		})();


		// process next query in queue
		var next_query = function(f_okay) {
			if(a_queries.length) {
				a_queries.shift()();
				setTimeout(function() {
					next_query(f_okay)
				}, 0);
			}
			else {
				f_okay && f_okay();
			}
		};


		// executes a query
		var exec_query = (function() {

			// nodejs
			if(__env_nodejs) {
				return function(s_query, f_okay, f_err) {
					y_proxy.query(s_query, function(err, result) {
						if(err) return (f_err && (false !== f_err(err))) || exports.error(err);
						else f_okay && f_okay(result);
					});
				};
			}

			// browser
			else {
				return function(s_query, f_okay, f_err) {
					exports.info('# '+s_query);
					$.ajax({
						url: s_endpoint_url,
						method: 'POST',
						data: {
							connection: s_connection,
							query: s_query,
						},
						dataType: 'json',
						success: function(h_res) {
							if(h_res.error) return (f_err && f_err(h_res.error)) || exports.error(h_res.error);
							else f_okay && f_okay(h_res.rows);
						},
					});
				};
			}
		})();


		// submits a query 
		var submit_query = function(s_query, f_okay, f_err) {
			if(!b_ready) a_queries.push(exec_query.bind({}, s_query, f_okay, f_err));
			else exec_query.apply(this, arguments);
		};


		// generate a so-substituter
		var f_so = function(h_how) {
			return function(s_field) {
				return h_how.pre+s_field+h_how.post;
			};
		};


		// 
		var is_so = function(s_table, s_field, z_value) {

			// prepare beginning of part
			var s_part = '"'+s_table+'"."'+s_field+'"';

			// depending on value type
			var s_type = typeof z_value;

			switch(s_type) {
				case 'string':
				case 'number':
				case 'boolean':
					return s_part+'='+valufy(z_value);

				case 'function':
					var z_ret = z_value.apply({}, [s_part]);
					if('string' == typeof z_ret) return z_ret;
					else return is_so(s_table, s_field, z_ret);

				case 'object':
					// array
					if(z_value instanceof Array) {
						var a_ors = [];
						for(var i=z_value.length-1; i>=0; i--) {
							a_ors.push(
								is_so(s_table, s_field, z_value[i])
							);
						}
						return '('+a_ors.join(' or ')+')';
					}
					// simple op-val hash
					else if(z_value.op && z_value.val) {
						return s_part+' '+z_value.op+' '+valufy(z_value.val);
					}

				default:
					exports.error('value type "'+s_type+'" not supported');
					throw 'invalid value type: '+s_type;
			}
		};


		// adds the implicit join to another table
		var add_join = function(h_query, s_from, s_to) {

			// foreign-key rule?
			var h_rule = h_fkeys[s_from+'='+s_to];

			// no rules!
			if(!h_rule) return exports.fail('must define an inter-table relation for an implicit join from "'+s_from+'" to "'+s_to+'"');

			// establish inner join
			h_query.joins[s_to] = 'inner join "'+s_to+'" on "'+s_from+'"."'+h_rule.local+'"="'+s_to+'"."'+h_rule.foreign+'"';
		};


		// construct where clause
		var expand = function(h_query, h_where, s_from_override) {

			// reference this table name
			var s_from = s_from_override || h_query.from;

			// local where clause
			var a_clause = [];

			// iterate 
			for(var s_key in h_where) {
				var z_value = h_where[s_key];

				// inner join
				if('object' == typeof z_value) {

					// array!
					if(z_value instanceof Array) {

						// array contains objects
						if('object' == typeof z_value[0]) {

							// foreign table has not been joined yet in this query
							if(!h_query.joins[s_key]) {

								// add join
								add_join(h_query, s_from, s_key);
							}

							// iterate each 'or'
							var a_ors = [];
							for(var i=z_value.length-1; i>=0; i--) {

								// expand each one
								a_ors.push('('+expand(h_query, z_value[i], s_key)+')');
							}

							a_clause.push(a_ors.join(' or '));
						}

						// array contains values
						else {
							var s_ors = '';
							for(var i=0; i<z_value.length; i++) {
								s_ors += (i? ' or ': '')+is_so(s_from, s_key, z_value[i]);
							}
							a_clause.push(s_ors);
						}
					}

					// plain object
					else {

						// foreign table has not been joined yet in this query
						if(!h_query.joins[s_key]) {

							// add join
							add_join(h_query, s_from, s_key);
						}

						// add to clause
						for(var s_ffield in z_value) {

							// create conditional part
							var s_part = is_so(s_key, s_ffield, z_value[s_ffield]);

							// failed
							if(!s_part) return exports.error('aborting query build');

							// succeeded; continue
							a_clause.push(s_part);
						}
					}
				}

				// regular 
				else {

					// create conditional part
					var s_part = is_so(s_from, s_key, z_value);

					// failed
					if(!s_part) return exports.error('aborting query build');

					// succeeded; continue
					a_clause.push(s_part);
				}
			}

			// return top-level 'and's
			return a_clause.join(' and ');
		};


		// convert hash query to string query
		var select_to_sql = function(h_query) {
			var b = 'select '+(h_query.select.join(',') || '*')
				+' from "'+h_query.from+'"';

			// ref joins, iterate
			var h_joins = h_query.joins;
			for(var e in h_joins) b += ' '+h_joins[e];

			//
			if(h_query.where.length) b += ' where '+h_query.where.join(' and ');

			//
			if(h_query.group.length) b += ' group by '+h_query.group.join(',');
			if(h_query.order.length) b += ' order by '+h_query.order.join(',');
			if(h_query.limit) b += ' limit '+h_query.limit;
			if(h_query.offset) b += ' offset '+h_query.offset;

			// 
			return b;
		};

		// convert hash query to string query
		var insert_to_sql = function(h_query) {
			var b = 'insert into "'+h_query.into+'"';

			var h_ins = h_query.insert;
			var a_keys = Object.keys(h_ins);
			var s_keys = '', s_vals = '';
			for(var i=a_keys.length-1; i>=0; i--) {
				var si_key = a_keys[i];
				s_keys += '"'+si_key+'"'+(i? ',': '');
				s_vals += valufy(h_ins[si_key])+(i? ',': '');
			}

			// append keys and values
			b += ' ('+s_keys+') values('+s_vals+')';

			// 
			return b;
		};


		// 
		var R_SELECT = /^(?:(\w+)\s*=\s*)?([\^#]+)?(?:(\w*)\.)?(\w+|\*)(?:::(\w+)(?:\(([^\)]*)\))?)?$/;
		var R_SELECT = /^(?:(\w+)\s*=\s*)?([\^#]+)?(?:(\w*)\.)?(\w+|\*)((?:\+(?:\w*\.)?\w+)*)(?:::(\w+)(?:\(([^\)]*)\))?)?$/;
		var R_SELECT = /^(?:(\w+)\s*=\s*)?([\^#]+)?((?:\w*\.)?(?:\w+|\*)(?:\+(?:\w*\.)?\w+)*)(?:::(\w+)(?:\(([^\)]*)\))?)?$/;

		// resolve field
		var resolve_field = function(s_from, s_input) {

			//
			var i_dot = s_input.indexOf('.');

			// full ident
			if(i_dot != -1) {
				var s_table = s_input.substr(0, i_dot);
				return '"'+(s_table || s_from)+'"."'+s_input.substr(i_dot+1)+'"';	
			}
			// semi-ident
			else {
				return '"'+s_input+'"';
			}
		};


		//
		var parse_field = function(h_query, s_input) {

			//
			var i_dot = s_input.indexOf('.');
			var s_table, s_field = s_input;

			// full ident
			if(i_dot != -1) {
				s_table = s_input.substr(0, i_dot);
				s_field = s_input.substr(i_dot+1);
			}

			// wildcard
			if(s_field == '*') s_field = '';

			// full identifer: `table.field`
			if(s_table) {

				// external table specified and it's not linked
				if((s_table != h_query.from) && !h_query.joins[s_table]) add_join(h_query, h_query.from, s_table);
			}

			// construct full identifier
			var s_full = '"'+(s_table || h_query.from)+'".'+(s_field? '"'+s_field+'"': '*');

			// return package
			return {
				alias: s_field,
				ident: s_full,
			};
		};


		//
		var parse_fields = function(h_query, s_fields) {

			// split fields by concat operator
			var m_fields = s_fields.split(/\+/g);

			// concatenation
			if(m_fields.length > 1) {
				var s_alias = '';
				var s_ident = 'concat(';

				for(var i=0; i<m_fields.length; i++) {
					var h_parsed = parse_field(h_query, m_fields[i]);
					s_alias += (i? '_': '')+h_parsed.alias;
					s_ident += (i? ',': '')+h_parsed.ident;
				}
				s_ident += ')';

				return {
					alias: s_alias,
					ident: s_ident,
				};
			}
			// single field
			else {
				return parse_field(h_query, m_fields[0]);
			}
		};


		// query-builder
		var qb_select = function(h_query) {

			// fix query hash
			h_query = {
				from: h_query.from,
				joins: h_query.joins || {},
				fields: h_query.fields || {},
				select: h_query.select || [],
				where: h_query.where || [],
				group: h_query.group || [],
				order: h_query.order || [],
				limit: h_query.limit || 0,
				offset: h_query.offset || 0,
			};

			// execute this query
			var f_exec = function(f_okay, f_err) {
				var s_query = select_to_sql(h_query);
				submit_query(s_query, f_okay, f_err);
				return d_self;
			};

			// builder object
			var d_self = {

				// select
				select: function() {

					// multiple selection arguments
					for(var i=arguments.length-1; i>=0; i--) {
						var s_arg = arguments[i];

						//
						var m_select = R_SELECT.exec(s_arg);

						// 
						var s_alias = m_select[1] || '';
						var s_fields = m_select[3];

						//
						var h_parsed = parse_fields(h_query, s_fields);

						// function modifier
						var s_fn = m_select[4];
						if(s_fn) {
							var f_fn = h_select_fns[s_fn];
							if(!f_fn) throw exports.error('No such selector function defined: "'+s_fn+'"');
							s_select = f_fn(h_parsed.ident, m_select[5]);
							if(!s_alias) s_alias = h_parsed.alias;
						}
						// regular
						else {
							s_select = h_parsed.ident;
						}

						// special
						if(m_select[2]) {
							var s_special = m_select[2];

							// count (& possibly distinct)
							if(s_special[0] == '#') s_select = 'count('+(s_special.length==2? 'distinct ': '')+s_select+')';

							// just distinct
							else s_select = 'distinct '+s_select;
						}

						// as alias
						if(s_alias) {
							s_select += ' as "'+s_alias+'"';
							h_query.fields['"'+s_alias+'"'] = s_alias;
						}

						// store this as a field used
						h_query.fields[h_parsed.ident] = s_alias || h_parsed.alias;

						// push
						h_query.select.push(s_select);
					}
					return d_self;
				},

				//
				where: function(z_where) {
					if('object' == typeof z_where) {

						// 'or'-ing clauses
						if(z_where instanceof Array) {

							// clauses
							var a_clauses = [];

							// iterate
							for(var i=z_where.length-1; i>=0; i--) {
								a_clauses.push(expand(h_query, z_where[i]));
							}

							// join
							h_query.where.push('('+a_clauses.join(' or ')+')');
						}
						// 'and'-ing clause
						else {
							h_query.where.push('('+expand(h_query, z_where)+')');
						}
					}
					return d_self;
				},

				//
				count: function(s_alias) {
					h_query.select.push('count(*) as "'+s_alias+'"');
					return d_self;
				},

				//
				join: function(s_table) {
					if(!h_query.joins[s_table]) add_join(h_query, h_query.from, s_table);
					return d_self;
				},

				//
				group: function() {

					// multiple group by arguments
					for(var i=arguments.length-1; i>=0; i--) {
						var s_field = arguments[i];

						var s_full = resolve_field(h_query.from, s_field);

						// this field had not been exlpicity selected
						if(!h_query.fields[s_full]) {

							// select field
							h_query.select.push(s_full);

							// add it to fields list using its alias
							h_query.fields[s_full] = s_field;
						}

						// add full ident as group
						h_query.group.push(s_full);
					}

					return d_self;
				},

				//
				order: function(s_field, n_way) {
					var s_dir = ((n_way && n_way<0)? 'desc': 'asc');
					h_query.order.push(resolve_field(h_query.from, s_field)+' '+s_dir);
					return d_self;
				},

				//
				limit: function(n_limit) {
					h_query.limit = n_limit;
					return d_self;
				},

				//
				offset: function(n_offset) {
					h_query.offset = n_offset;
					return d_self;
				},

				// output current sql
				dump: function(f_dump) {
					f_dump = f_dump || console.log.bind(console);
					f_dump(select_to_sql(h_query));
					return d_self;
				},

				//
				clone: function() {
					return qb_select(h_query);
				},

				// submit query and handle results directly
				exec: f_exec,
				results: function(f_okay, f_err) {
					return f_exec(f_okay, f_err);
				},

				// 
				output: function(f_to) {
					f_to = f_to || console.info.bind(console);
					return f_exec(f_to);
				},

				// use predefined handler to render results
				render: function(si_render, h_options) {
					var k_render = h_renderers[si_render];
					if(!k_render) return exports.error('no such renderer defined: "'+si_render+'"');
					f_exec(function(a_results) {
						k_render.apply(render_helper(a_results), [h_options, a_results]);
					});
					return d_self;
				},

				// 
				each: function(f_each, f_okay) {
					f_exec(function(a_rows) {
						for(var i=0,l=a_rows.length; i<l; i++) {
							f_each.apply({}, [a_rows[i], i]);
						}
						f_okay && f_okay();
					});
					return d_self;
				},

				// 
				export: function() {
					for(var e in h_query) {
						if(typeof h_query[e] == 'string') {
							h_query[e] = h_query[e].replace(/[\n\t]+/g,' ');
						}
					}
					return h_query;
				},
			};

			// extend these functions
			d_self.select.raw = function(s_select) {
				h_query.select.push(s_select);
				return d_self;
			};

			return d_self;
		};


		// query-builder
		var qb_insert = function(h_query) {

			//
			h_query = {
				into: h_query.into,
				insert: h_query.insert || {},
			};

			// execute this query
			var f_exec = function(f_okay, f_err) {
				var s_query = insert_to_sql(h_query);
				submit_query(s_query, f_okay, f_err);
				return d_self;
			};

			// 
			var d_self = {

				//
				insert: function(h_values) {
					for(var e in h_values) {
						h_query.insert[e] = h_values[e];
					}
					return d_self;
				},

				//
				clone: function() {
					return qb_insert(h_query);
				},

				// output current sql
				dump: function(f_dump) {
					f_dump = f_dump || console.log.bind(console);
					f_dump(insert_to_sql(h_query));
					return d_self;
				},

				// 
				exec: f_exec,
			};

			return d_self;
		};



		// for operator argument functions eg: `pg('&',7,'>',1)`
		var collapse = function(a_args, i_start) {

			// pre and post parts
			var s_pre = '', s_post = '';

			// iterate args
			for(var i=(i_start || 0); i<a_args.length-1; i+=2) {

				// multi-arguments
				if(s_post) { s_pre += '('; s_post += ')'; }

				// collapse
				s_post += ' '+a_args[i]+' '+valufy(a_args[i+1]);	
			}

			// return how
			return {
				pre: s_pre,
				post: s_post,
			};
		};


		var post_collapse = function(a_args) {
			var h_how = collapse(a_args, 1);
			h_how.prime = a_args[0];
			return function(s_field) {
				return this.pre+this.prime(s_field)+this.post;
			}.bind(h_how);
		};
		
		/**
		* public operator() ();
		**/
		var operator = function(z_prime) {

			// dynamic
			if('function' == typeof z_prime) {
				return post_collapse(arguments);
			}
			// static
			else {
				return f_so(
					collapse(arguments)
				);
			}
		};
		
		
		/**
		* public:
		**/
			var R_FKEY = /^([^\.]+)\.([^=]+)=([^\.]+)\.(.+)$/;

			// entry point for query-building
			operator['connect'] = function(s_endpoint, s_connect) {
				s_endpoint_url = s_endpoint;
				s_connection = s_connect;
			};

			// 
			operator['define'] = function(s_relation) {
				if((m_fkey=R_FKEY.exec(s_relation)) != null) {
					var s_ta = m_fkey[1], s_ka = m_fkey[2];
					var s_tb = m_fkey[3], s_kb = m_fkey[4];

					// define directed relation
					h_fkeys[s_ta+'='+s_tb] = {local: s_ka, foreign: s_kb};

					// define inverse too (if bi-directional)
					h_fkeys[s_tb+'='+s_ta] = {local: s_kb, foreign: s_ka};
				}
			};

			//
			operator['selector'] = function(s_key, z_fn) {

				// simple mono-field function
				if('string' == typeof z_fn) {
					h_select_fns[s_key] = (function(s_field) {
						return this.func+'('+s_field+')';
					}).bind({func: z_fn});
				}
				// special functinon
				else if('function' == typeof z_fn) {
					h_select_fns[s_key] = f_fn;
				}
				// unsupported type
				else {
					expose.error('failed to set selector "'+s_key+'" using '+(typeof z_fn)+' type');
				}
			};

			// entry point for query-building
			operator['from'] = function(s_table) {
				return qb_select({
					from: s_table,
				});
			};


			// entry point for query-building
			operator['into'] = function(s_table) {
				return qb_insert({
					into: s_table,
				});
			};
		

			// entry point for query-building
			operator['use'] = function(si_render, f_render) {
				h_renderers[si_render] = f_render;
			};


			// close connection
			operator['close'] = function() {
				if(y_proxy) y_proxy.end();
			};


			// execute raw sql
			operator['exec'] = submit_query;


			// pass sql string and other args through to proxy
			operator['proxy'] = function() {
				return y_proxy.query.apply(this, arguments);
			};
		
		
		return operator;	
	};


	/**
	* public static operator() ()
	**/
	var exports = __exportee[__name] = function() {
		if(this !== __namespace) {
			return __construct.apply(this, arguments);
		}
		else {
			if(d_global_instance) {
				if(arguments.length) {
					return d_global_instance.apply(this, arguments);
				}
				return d_global_instance;
			}
			else {
				return __construct.apply(this, arguments);
			}
		}
	};

	
	/**
	* public static:
	**/
		
		//
		exports['toString'] = function() {
			return __class+'()';
		};
		
	// wrap public static declarations in an iiaf
	(function() {

		// ref Array.prototype.slice
		var Aps = Array.prototype.slice;

		// output a message to the console prefixed with this class's tag
		var debug = function(channel) {
			return function() {
				var args = Aps.call(arguments);
				args.unshift(__class+':');
				console[channel].apply(console, args);
			};
		};
		
		// open the various output channels
		exports['log'] = debug('log');
		exports['info'] = debug('info');
		exports['warn'] = debug('warn');
		exports['error'] = debug('error');
		exports['fail'] = function(err) {
			exports.error(err);
			throw new Error(err);
		};
	})();
		

	// wrap global instance calls in iiaf
	(function() {
		var global_instance = function(s_method) {
			return function() {
				return d_global_instance && d_global_instance[s_method].apply(this, arguments);
			};
		};

		// various global transcends
		exports['connect'] = global_instance('connect');
		exports['close'] = global_instance('close');
		exports['define'] = global_instance('define');
		exports['selector'] = global_instance('selector');
		exports['use'] = global_instance('use');
		exports['from'] = global_instance('from');
		exports['into'] = global_instance('into');
		exports['exec'] = global_instance('exec');
		exports['proxy'] = global_instance('proxy');
	})();


	// fn-val shortcuts
	(function() {
		var fnval = function(s_fn) {
			return function(s_val) {
				if(arguments.length > 1) {
					for(var i=1; i<arguments.length; i++) {
						s_val += ','+arguments[i];
					}
				}
				return function(s_field) {
					return s_fn+'('+s_field+','+s_val+')'
				};
			};
		};

		// geometry
		exports['within'] = fnval('ST_Within');
		exports['buffer'] = fnval('ST_Buffer');
		exports['within_distance'] = fnval('ST_DWithin');
		exports['distance'] = fnval('ST_Distance');
		exports['distance_spheroid'] = fnval('ST_Distance_Spheroid');

		// aggregate
		exports['max'] = fnval('MAX');
	})();


	// static shortcuts
	(function() {

		// define constants
		var H_CONST = {
			WGS_84: valufy('SPHEROID["WGS 84",6378137,298.257223563]'),
		};

		// push all key/value pairs onto exports hash
		for(var e in H_CONST) exports[e] = H_CONST[e];
	})();


	// geom shortcut
	(function() {

		var H_GEOJSON_CRS_4326 = {
			type: 'name',
			properties: {
				'name': 'EPSG:4326',
			},
		};

		exports['geom'] = function(z_geom, n_srid) {
			var s_geom = '';
			if('object' == typeof z_geom) {
				if(z_geom instanceof Array && z_geom.length) {
					s_geom += "ST_GeomFromText('";
					if(z_geom[0] instanceof Array) {
						s_geom += 'POLYGON(', s_close = '';
						for(var i=0; i<z_geom.length; i++) {
							var a_crd = z_geom[i];
							if(i) s_geom += ',';
							var s_pts = a_crd[0]+' '+a_crd[1]+(a_crd.lenth==3? ' '+a_crd[2]:'');
							if(!i) s_close = s_pts;
							s_geom += s_pts;
						}
						s_geom += ','+s_close+')';
					}
					else {
						s_geom += 'POINT('+z_geom[0]+' '+z_geom[1]+(z_geom.length==3? ' '+z_geom[2]:'')+')';
					}
					s_geom += "',"+(n_srid || 4326)+")";
				}
				else if(typeof z_geom.type == 'string') {
					switch(z_geom.type.toLowerCase()) {
						case 'point':
						case 'polyline':
						case 'polygon':
							if(!z_geom.crs) z_geom.crs = H_GEOJSON_CRS_4326;
							s_geom += "ST_GeomFromGeoJSON('"+JSON.stringify(z_geom)+"')";
							break;
					}
				}
			}
			else if('string' == typeof z_geom) {
				s_geom += "ST_GeomFromText('"+z_geom+"',"+(n_srid || 4326)+")";
			}
			// return {raw: s_geom};
			return (function() {
				return this.geom;
			}).bind({geom: s_geom});
		};
	})();

	// simple shortcuts
	(function() {

		exports['time'] = function(z_time) {
			// milliseconds
			if('number' == typeof z_time) {
				return {raw: 'to_timestamp('+(z_time / 1000)+')'};
			}
			// date object
			else if('object' == typeof z_time) {
				if(z_time instanceof Date) {
					return {raw: 'to_timestamp('+(z_time.getTime() / 1000)+')'};
				}
			}
			else {
				exports.fail('cannot create time using ['+(typeof z_time)+']: ',z_time);
			}
		};

		exports['now'] = function(n_milliseconds_adjust) {
			return {raw: 'to_timestamp('+((Date.now()+(n_milliseconds_adjust||0))/1000)+')'};
		};

	})();


		// configure
		exports['config'] = function(h_config) {

			// global mode
			if(h_config.global) {

				// create global instance
				d_global_instance = exports.apply({}, [h_config.global]);

				// load defaults
				defaults(d_global_instance);

				// export alias to namespace
				var d_static = exports.bind(__namespace);

				// an alias was given
				if(h_config.alias) {
					__exportee[h_config.alias] = d_static;
				}

				// along with exportsd methods
				for(var e in exports) {
					d_static[e] = exports[e];
				}

				return d_static;
			}
		};

		// 
		exports[''] = function() {

		};

})();