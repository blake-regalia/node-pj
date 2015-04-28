'use strict';

module.exports = function(grunt) {

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		marked: {

			options: {
				highlight: true,
				markdownOptions: {
					highlight: 'manual',
				},
			},
			dist: {
				files: {
					'doc/README.html': 'README.md',
				},
			},
		},

	});

	// markdown compiler
	grunt.loadNpmTasks('grunt-marked');


	// Default task(s).
	grunt.registerTask('default', ['marked']);

};