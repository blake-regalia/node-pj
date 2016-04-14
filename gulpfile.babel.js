
// gulp
import gulp from 'gulp';

// load gulp plugins
import plugins from 'gulp-load-plugins';
const $ = plugins({
	// // uncomment these lines to show debug messages while loading gulp plugins
	// DEBUG: true,

	// load gulp and vinyl modules
	pattern: ['gulp-*', 'vinyl-*'],
	replaceString: /^(?:gulp|vinyl)(-|\.)/,
});

// config of paths
const config = {
	src: {
		scripts: './lib/pj.js',
	},
	dest: {
		scripts: './dist/',
	},
};


// transpile es2015 to es5
gulp.task('transpile', () => {

	// load all javascript source files
	return gulp.src(config.src.scripts)

		// handle uncaught exceptions thrown by any of the plugins that follow
		.pipe($.plumber())

		// // do not recompile unchanged files
		// .pipe($.cached('transpile'))

		// lint all javascript source files in es2015 context
		.pipe($.eslint())
		.pipe($.eslint.format())
		// .pipe($.eslint.failAfterError())

		// preserve mappings to source files for debugging in es5 runtime
		.pipe($.sourcemaps.init())

			// transpile es2015 => es5
			.pipe($.babel())
		.pipe($.sourcemaps.write())

		// write output to dist directory
		.pipe(gulp.dest(config.dest.scripts));
});

// continuously update
gulp.task('develop', ['transpile'], () => {
	gulp.watch(config.src.scripts, ['transpile']);
});

// default task
gulp.task('default', ['transpile']);
