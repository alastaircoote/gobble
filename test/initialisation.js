var assert = require( 'assert' );
var sander = require( 'sander' );
var gobble = require( '..' );
var path = require( 'path' );
var os = require( 'os' );

gobble.cwd( __dirname );

module.exports = function () {
	describe( 'initialisation', function () {
		beforeEach( function () {
			return Promise.all([
				sander.rimraf( '.gobble-build' ),
				sander.rimraf( 'tmp' )
			]);
		});

		it( 'errors on non-existent directories (#12)', function () {
			assert.throws( function () {
				gobble( 'sample/nope' );
			}, /nope directory does not exist/ );
		});

		it( 'errors if you try to pass multiple nodes to gobble()', function () {
			assert.throws( function () {
				gobble( 'tmp/foo', 'tmp/bar' );
			}, /could not process input/ );
		});

		it( 'errors if an input array member is invalid', function () {
			assert.throws( function () {
				gobble([ 42 ]);
			}, /could not process input/ );
		});

		it( 'should merge nodes', function () {
			var foo = gobble( 'sample/foo' );
			var bar = gobble( 'sample/bar' );
			return gobble( [ foo, bar ] ).build({
				dest: 'tmp/output'
			}).then( function () {
				assert.deepEqual( sander.lsrSync('tmp/output'), [
					path.normalize( 'a/dir/a.md' ),
					path.normalize( 'b/dir/b.md' ),
					path.normalize( 'bar.md' ),
					path.normalize( 'baz.md' ),
					path.normalize( 'foo.md' )
				]);
			});
		});
	});
};
