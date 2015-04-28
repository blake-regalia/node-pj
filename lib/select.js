
var N_MODE_INIT = 0,
	N_MODE_MAIN = 1;

var n_s = s.length;
for(var i=0; i<n_s; i++) {
	var n_char = s.charCodeAt(i);

	switch(n_mode) {

		case N_MODE_INIT:

			// [A-Za-z_\u00c0-\u024f]
			if(
				(n_char >= 0x0061 && n_char <= 0x007A) // a-z
				|| (n_char == 0x005F) // _
				|| (n_char >= 0x0041 && n_char <= 0x005A) // A-Z
				|| (n_char >= 0x00C0 && n_char <= 0x024F) // latin extended A & B
			) {
				s_ident = s[i];

				// collect all the rest of the characters
				while(++i < n_s) {
					n_char = s.charCodeAt(i);

					// [A-Za-z_0-9\$\u00c0-\u024f]
					if(
						(n_char >= 0x0061 && n_char <= 0x007A) // a-z
						|| (n_char == 0x005F) // _
						|| (n_char >= 0x0041 && n_char <= 0x005A) // A-Z
						|| (n_char >= 0x0030 && n_char <= 0x003) // 0-9
						|| (n_char == 0x0024) // $
						|| (n_char >= 0x00C0 && n_char <= 0x024F) // latin extended A & B
					) {
						s_ident += s[i];
					}
				}

				// 
			}

	}
}


ident		[A-Za-z_\u00c0-\u024f][A-Za-z_0-9\$\u00c0-\u024f]*