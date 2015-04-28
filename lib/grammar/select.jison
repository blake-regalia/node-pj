%lex

/* From http://www.postgresql.org/docs/current/static/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS:
SQL identifiers and key words must begin with a letter (a-z, but also letters with diacritical marks and non-Latin letters) or an underscore (_). Subsequent characters in an identifier or key word can be letters, underscores, digits (0-9), or dollar signs ($) */
ident		[A-Za-z_\u00c0-\u024f][A-Za-z_0-9\$\u00c0-\u024f]*

args 		[^\)]*

delim 		[ ,\/]


%%

{ident}		{ return 'IDENT'; }
{args}		{ return 'ARGS'; }
{delim}		{ return 'DELIMITER'; }

'.'			return '.'
'='			return '='
'::'		return '::'
'('			return '('
')'			return ')'

<<EOF>>		return 'EOF'

/lex


%start grammar
%%

grammar
	: statement eof
		%{
			console.log(statement);
		%}
	;

eof
	: EOF
	| 1
	;

statement
	: IDENT payload
		%{
			$$ = $payload.body;
			if($payload.hasAssignment) {
				$$.alias = $IDENT;
			}
			else if($payload.hasColumn) {
				$$.fields.push({
					table: $IDENT,
					column: $payload.column,
				});
			}
		%}
	;

payload
	: '=' body
		%{
			$$ = {
				hasAssignment: true,
				body: $body,
			};
		%}
	| '.' IDENT moreFields_ casters_
		%{
			$$ = {
				hasColumn: true,
				column: $IDENT,
				body: $body,
			};
		%}
	| casters_
		%{
			$$ = {
				body: {
					casters: $body,
				},
			};
		%}
	;

body
	: fields casters_
		%{
			$$ = {
				fields: $fields,
				casters: $casters_,
			};
		%}
	;

alias_
	: IDENT '='
		%{
			$$ = {
				name: $IDENT,
			};
		%}
	|
	;

fields
	: field fields_
		%{
			$$ = $fields_;
			$$.push($field);
		%}
	;

fields_
	: field fields_
		%{
			$$ = $fields_;
			$$.push($field);
		%}
	| { $$ = []; }
	;

field
	: table_ IDENT
		%{
			$$ = {
				table: $table_,
				column: $IDENT,
			};
		%}
	;

moreFields_
	: DELIMITER field moreFields_
		%{
			$$ = $moreFields_;
			$$.push($field);
			$$.push($DELIMITER);
		%}
	| { $$ = []; }
	;

table_
	: IDENT '.' 
		%{
			$$ = {
				name: $IDENT,
			};
		%}
	| '.'
		%{
			$$ = {
				auto: true,
			};
		%}
	|
	;

casters_
	: caster casters_
		%{
			$$ = $casters_;
			$$.push($caster);
		%}
	| { $$ = []; }
	;

caster
	: '::' IDENT args_
		%{
			$$ = {
				caster: $IDENT,
				args: $args || '',
			};
		%}
	;

args_
	: '(' ARGS ')'
		%{
			$$ = $ARGS;
		%}
	|
	;