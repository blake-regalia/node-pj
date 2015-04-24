var defaults = require(__dirname+'/defaults');

/**
* class pj
**/
(function() {

	/**
	* private static:
	**/
	var __class = 'pj';
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

	// 
	var d_global_instance = false;

	// global custom type casters
	var h_global_casters = {};


	// const defaults
	var H_DEFAULTS = {
		protocol: 'postgres',
		user: 'root',
		host: 'localhost',
		port: '5432',
		autofold: true,
	};

	// const data types
	var H_DATA_TYPES = defaults.DATA_TYPES;

	// create connection string
	var connection_string = (function() {

		// regex constant
		var R_CONNECT = /^(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w*)(?::(\d+))?\/)?(\w+)$/;

		// parse function
		return function(s_connect) {

			// parse connection string
			var m_connect = R_CONNECT.exec(s_connect);
			if(!m_connect) exports.fail('invalid connection string: "'+s_connect+'"');
			return ''
					+(m_connect[1] || H_DEFAULTS.protocol)+'://'
					+(m_connect[2] || H_DEFAULTS.user)
						+(m_connect[3]? ':'+m_connect[3]: '')+'@'
					+(m_connect[4] || H_DEFAULTS.host)+':'
						+(m_connect[5]? ':'+m_connect[5]: '')+'/'
					+m_connect[6];
		};
	})();


	// escape string value bits
	var escape_string = function(s_value) {
		return s_value
			.replace(/'/g,"''")
			.replace(/\t/g, '\\t')
			.replace(/\n/g, '\\n');
	};


	//
	var valufy = function(z_value) {

		// value type
		var s_type = typeof z_value;
		switch(s_type) {

			case 'string':
				return "'"+escape_string(z_value)+"'";

			case 'number':
				return z_value;

			case 'boolean':
				return z_value? 'TRUE': 'FALSE';

			case 'object':

				// null
				if(z_value === null) {
					return null;
				}
				// raw sql
				else if('string' === typeof z_value.raw) {
					return z_value.raw;
				}
				else {
					return escape_string(
						JSON.stringify(z_value)
					);
				}

			case 'function':
				return z_value()+'';

			// symbol, undefined...
			default:
				throw new Error('unable to valuefy type "'+s_type+'"');
		}
	};


	// caster syntax regex
	var R_CASTER = /^(\w+)(?:\((.*)\))?$/g;
	var R_CASTER_PARAM = /^,?\s*\$(\w+)(?:\='([^']*)')?\s*$/g;

	// define custom type caster
	var define_type_caster = function(h_casters, s_caster, z_definer) {

		// depending on caster type definition
		var s_type = typeof z_definer;
		switch(s_type) {

			// custom type caster syntax
			case 'string':

				// reset caster regex index
				R_CASTER.lastIndex = 0;

				// parse caster syntax
				var m_caster = R_CASTER.exec(s_caster);

				// ref alias
				var s_alias = m_caster[1];

				// alias cannot override native data type, throw error
				if(H_DATA_TYPES[s_alias]) exports.fail('cannot override native data type "'+s_alias+'" for type casting');

				// prepare a reference object for parameters
				var h_params = {}, i_param = 0;

				// reset caster param regex index
				R_CASTER_PARAM.lastIndex = 0;

				// parse parameters
				var s_params = m_caster[2];
				while((m_param=R_CASTER_PARAM.exec(s_params)) !== null) {

					// ref parameter name
					var s_param_name = m_param[1];

					// param default value
					var s_default_value = m_param[2];

					// store parameter info
					h_params[s_param_name] = {
						index: i_param,
						optional: (s_default_value != null),
						default_val: s_default_value || '',
					};

					// increment parameter index
					i_param += 1;
				}

				// define caster
				h_casters[s_alias] = (function(s_field, s_args) {
					var h_params = this.params;
					var s_syntax = this.syntax;

					//
					var a_args = s_args? s_args.split(','): [];

					// substitute variables
					var s_cast = s_syntax.replace(/\$(\w+)/g, function(s_whole, s_name) {

						// 0th argument indicates the identifier
						if(s_name === '0') return s_field;

						// lookup param by name
						var h_param = h_params[s_name];

						// no such parameter
						if(!h_param) exports.fail('no such parameter named "'+s_name+'" in type caster syntax: "'+s_syntax+'"');

						// lookup arg
						var z_arg = a_args[h_param.index];

						// return arg value, if it's not defined => use default value
						return (z_arg == null)? h_param.default_val: z_arg;
					});

					// 
					return s_cast;
				}).bind({
					params: h_params,
					syntax: z_definer,
				});
				return;

			// user-defined type caster
			case 'function':
				h_casters[s_caster] = z_definer;
				return;

			// unsupported type
			default:
				expose.error('failed to create custom type caster "'+s_caster+'" using '+s_type+' type');
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
		var h_renderers = {};

		// custom type casters
		var h_casters = {};

		// configs
		var s_connection = '';
		var s_endpoint_url = '';
		var b_autofold = H_DEFAULTS.autofold;


		// automatically convert identifiers to lowercase when enquoting (needs to be local to allow instances to override)
		var identifier = function(s_ident) {
			return '"'+b_autofolds_ident.toLowerCase()+'"';
		};


		// setup 
		(function() {

			var s_config_type = typeof z_config;

			// config type
			switch(s_config_type) {

				// connection string
				case 'string':
					s_connection = connection_string(z_config);
					break;

				// hash of config
				case 'object':

					// connect to database
					if(z_config.connect) {
						var z_connect = z_config.connect;

						// connection string
						if('string' == typeof z_connect) {
							s_connection = connection_string(z_connect);
						}
						// connection info embedded in hash
						else if('object' == typeof z_connect && !(z_connect instanceof Array)) {
							if(!z_connect.database) exports.fail('must specify a database');
							s_connection = ''
								+(z_connect.protocol || H_DEFAULTS.protocol)+'://'
								+(z_connect.user || H_DEFAULTS.user)
									+(z_connect.pass? ':'+z_connect.pass: '')+'@'
								+(z_connect.host || H_DEFAULTS.host)
									+(z_connect.port? ':'+z_connect.port: '')+'/'
								+z_connect.database;
						}
					}

					// set endpoint
					if(z_config.endpoint) {
						s_endpoint_url = z_config.endpoint;
					}

					// do not convert field names to lowercase
					if(z_config.autofold === false) {
						b_autofold = false;

						// override identifier quoting method for this instance
						identifier = function(s_ident) {
							return '"'+b_autofolds_ident+'"';
						};
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

			// non-empty queue
			if(a_queries.length) {

				// remove & execute first element
				a_queries.shift()();

				// continue on next event loop to avoid recursion
				setTimeout(function() {
					next_query(f_okay)
				}, 0);
			}
			// all done
			else {

				// return contolr to original caller
				f_okay && f_okay();
			}
		};


		// execute a query
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


		// submit a query (to be processed when ready)
		var submit_query = function(s_query, f_okay, f_err) {

			// not ready, push to queue
			if(!b_ready) a_queries.push(exec_query.bind({}, s_query, f_okay, f_err));

			// ready, execute immediately
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

			// prepare part with absolute identifier
			var s_part = identifier(s_table)+'.'+identifier(s_field);

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


		// convert query hash to query string for select statement
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

		// convert query hash to query string for insert statement
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

			// prepare to find delimiters
			var r_delimiters = /[, \/\|\+]+/g;

			// dry-run match delimiter
			var m_delim = r_delimiters.exec(s_fields);

			// single field
			if(m_delim == null) {
				return parse_field(h_query, s_fields);
			}

			// prepare to build an alias and an identifier
			var s_alias = '';
			var s_ident = 'concat(';

			// 
			var i_field_str = 0;

			// find valid concatenation delimiters
			do {

				console.log(m_delim);

				// extract field that comes before this delimiter
				var s_field = s_fields.substr(i_field_str, m_delim.index);

				// field is non-empty
				if(s_field.length) {

					// parse field, append to alias and ident
					var h_parsed = parse_field(h_query, s_field);
					s_alias += (s_alias? '_': '')+h_parsed.alias;
					s_ident += (s_ident? ',': '')+h_parsed.ident;
				}

				// ref delimiter
				var s_delim = m_delim[0];

				// delimiter is non-empty
				if(s_delim.length) {

					// indicates zero-width concatenation
					if(s_delim === '+') s_ident += "''";

					// delimiter concatenation
					s_ident += "'"+s_delim+"'";
				}

				// advance field str index
				i_field_str = m_delim.index + s_delim.length;

			} while((m_delim=r_delimiters.exec(s_fields)) !== null);

			// last field
			var s_field = s_fields.substr(i_field_str);

			// field is non-empty
			if(s_field.length) {

				// parse field, append to alias and ident
				var h_parsed = parse_field(h_query, s_field);
				s_alias += (s_alias? '_': '')+h_parsed.alias;
				s_ident += (s_ident? ',': '')+h_parsed.ident;
			}

			// 
			return {
				alias: s_alias,
				ident: s_ident,
			}
		};


		//
		var H_MONOCHAR_AGGREGATES = {
			'#': 'count',
			'$': 'last',
			'%': 'avg',
			'^': 'first',
			'&': 'bit_and',
			'|': 'bit_or',
			'+': 'max',
			'-': 'min',
			'=': 'sum',
		};

		var H_STRING_AGGREGATES = {
			'[]': 'array_agg',
			'&&': 'bool_and',
			'||': 'bool_or',
		};

		var H_SUBSTITUTE_AGGREGATES = {
			'<': {
				name: 'string_agg',
				end_char: '>',
			},
			'\'': {
				name: 'xmlagg',
				end_char: '\'',
			},
		};


		// select function alias matching regex (for type casting)
		var R_SELECT = /^(?:(\w+)\s*=\s*)?(\[\]|&&|\|\||'[^']*'|<[^>]*>)?([#$%^&*-+=<>\/])?([@])?((?:\w*\.)?(?:\w+|\*)(?:[, \/\|]+(?:\w*\.)?\w+)*)(?:::(\w+)(?:\(([^\)]*)\))?)?$/;
			var I_GROUP_SELECT_ALIAS = 1;
			var I_GROUP_SELECT_MONOCHAR_AGGREGATES = 2;
			var I_GROUP_SELECT_STRING_AGGREGATES = 3;
			var I_GROUP_SELECT_EMBEDDED_CLAUSE = 4;
			var I_GROUP_SELECT_FIELDS = 5;
			var I_GROUP_SELECT_TYPE = 6;
			var I_GROUP_SELECT_CAST_ARGS = 7;


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

					// allow multiple arguments
					for(var i=arguments.length-1; i>=0; i--) {
						var s_arg = arguments[i];

						// match select syntax on each input argument
						var m_select = R_SELECT.exec(s_arg);

						// ref alias & field(s)
						var s_alias = m_select[I_GROUP_SELECT_ALIAS] || '';
						var s_fields = m_select[I_GROUP_SELECT_FIELDS];

						//
						var h_parsed = parse_fields(h_query, s_fields);

						// type cast
						var s_type = m_select[I_GROUP_SELECT_TYPE];
						if(s_type) {

							// function argument
							var s_cast_args = m_select[I_GROUP_SELECT_CAST_ARGS];

							// native data type
							if(H_DATA_TYPES[s_type]) {

								// user tried to pass input argument(s), issue warning
								if(s_cast_args) exports.warn('native data type "'+s_type+'" does not accept input arguments for type casting');

								// build type cast
								s_select = h_parsed.ident+'::'+s_type;
							}

							// select function alias
							else {

								// lookup caster (first locallly then globally)
								var f_cast = h_casters[s_type] || h_global_casters[s_type];

								// no such caster defined, throw error
								if(!f_cast) exports.fail('there is no select function alias named: "'+s_type+'" for type casting\n\tHint: try using pj.alias(\''+s_type+'\', ..) to define such an alias');

								// call select function alias builder
								s_select = f_cast(h_parsed.ident, s_cast_args);

								// alias function returned a non-empty string, throw error
								if('string' !== typeof s_select || !s_select.length) {
									exports.fail('the "'+s_type+'" type caster did not return a non-empty string', f_cast);
								}

								// user did not specify an identifier alias, ommission means use default identifier name as alias
								if(!s_alias) s_alias = h_parsed.alias;
							}
						}

						// embedded clause
						var s_embedded_clause = m_select[I_GROUP_SELECT_EMBEDDED_CLAUSE];
						if(s_embedded_clause) {

							// distinct
							if(s_embedded_clause === '@') {
								s_select = 'distinct '+s_select;
							}
						}

						// monochar aggregate functions
						var s_monochar_aggregates = m_select[I_GROUP_SELECT_MONOCHAR_AGGREGATES];
						if(s_monochar_aggregates) {

							// wrap each aggregate function from the inside-out
							for(var i_char=s_monochar_aggregates.length-1; i_char>=0; i_char--) {
								s_select = H_MONOCHAR_AGGREGATES[s_monochar_aggregates[i_char]]+'('+s_select+')';
							}
						}

						// string aggregate functions
						var s_string_aggregates = m_select[I_GROUP_SELECT_STRING_AGGREGATES];
						if(s_string_aggregates) {

							// match all aggregate function codes
							for(var i_char=0; i_char<s_string_aggregates; i++) {

								// ref first character of n-character aggregate code
								var s_aggregate_char_0 = s_string_aggregates[i_char];
								switch(s_aggregate_char_0) {

									// double-char aggregate
									case '$': case '|': case '[':

										// extract double-char aggregate code
										var s_string_aggregate = s_string_aggregates.substr(i_char, 2);

										// lookup aggregate function
										var s_aggregate = H_STRING_AGGREGATES[s_string_aggregate];
										
										// no such aggregate function
										if(!s_aggregate) exports.fail('invalid aggregate function syntax: "'+s_string_aggregate+'"');

										// wrap seleect with aggregate function
										s_select = s_aggregate+'('+s_select+')';

										// advance character index
										i_char += 1;
										break;

									// substitutable string aggregate
									case '<': case '\'':

										// ref substitute aggregate info
										var h_aggregate_info = H_SUBSTITUE_AGGREGATES[s_aggregate_char_0];

										// ref ending character
										var s_aggregate_char_end = h_aggregate_info.end_char;

										// search for ending character
										var i_char_end = i_char;
										while(s_string_aggregates[i_char_end] != s_aggregate_char_end) i_char_end += 1;

										// extract delimiter
										var s_delim = s_string_aggregates.substring(i_char+1, i_char_end);

										// build aggregate into select portion
										s_select = h_aggregate_info.name+'('+s_select+',\''+s_delim+'\')';

										// advance character index
										i_char = i_char_end;
										break;
								}
							}
						}

						// use alias
						if(s_alias) {
							s_select += ' as "'+s_alias+'"';

							// remember that this alias was used (avoid select name conflicts)
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
					var s_dir = ((n_way && n_way<0)? 'descape_string': 'asc');
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

			//
			switch(typeof z_prime) {

				// static comparison
				case 'string':
					return f_so(
						collapse(arguments)
					);

				// dynamic comparison
				case 'function':
					return post_collapse(arguments);

				// and-ing
				case 'object':
					var h_wrapper = {items: arguments};
					Object.defineProperty(h_wrapper, 'pj.type', {
						value: 'and',
					});
					return h_wrapper;
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
			operator['alias'] = function(s_caster, z_definer) {
				define_type_caster(h_casters, s_caster, z_definer);
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
		
	// console wrappers
	(function() {

		// ref Array.prototype.slice
		var Aps = [].slice;

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
			throw __class+':'+Aps.call(arguments).join('');
		};

		// cross-compatibile assertion
		exports['assert'] = console.assert? debug('assert'): function(b_eval) {

			// assertion did not fail, return
			if(b_eval) return;

			var args = Aps.call(arguments);

			// remove eval condition
			args.shift();

			// prepend assertion string and class prefix
			args.unshift('Assertion failed: '+__class+':');

			// output to console using error channel
			console.error.apply(console, args);
		};
	})();
		

	// global instance forwarders
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


		// global type caster aliasing
		exports['alias'] = function(s_caster, z_definer) {
			define_type_caster(h_global_casters, s_caster, z_definer);
		};


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