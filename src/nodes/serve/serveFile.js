import { basename, extname } from 'path';
import * as mime from 'mime';
import { readFile, stat, createReadStream } from 'sander';
import { getSourcemapComment, SOURCEMAP_COMMENT } from '../../utils/sourcemap';
import * as parseRange from 'range-parser';
import * as rangeStream from 'range-stream';

export default function serveFile ( filepath, request, response ) {
	const ext = extname( filepath );

	// this might be turn out to be a really bad idea. But let's try it and see
	if ( ext === '.js' || ext === '.css' ) {
		return readFile( filepath ).then( data => {
			// this takes the auto-generated absolute sourcemap path, and turns
			// it into what you'd get with `gobble build` or `gobble watch`
			const sourcemapComment = getSourcemapComment( basename( filepath ) + '.map', ext );
			data = data.toString().replace( SOURCEMAP_COMMENT, sourcemapComment );

			response.statusCode = 200;
			response.setHeader( 'Content-Type', mime.lookup( filepath ) );

			response.write( data );
			response.end();
		});
	}

	return stat( filepath ).then( stats => {
		response.setHeader( 'Content-Type', mime.lookup( filepath ) );
		let fileStream = createReadStream( filepath );

		if ( request.headers['range'] ) {
			response.setHeader( 'Accept-Ranges', 'bytes' );
			const ranges = parseRange( stats.size, request.headers['range'] );

			if ( ranges === -2 ) {
				// malformed range
				console.error(request.headers['range'])
				response.statusCode = 400;
				response.end();

			} else if ( ranges === -1 ) {
				// range not satisfyable
				response.statusCode = 416;
				response.setHeader( 'Content-Range', '*/' + stats.size );
				response.end();
				
			} else if ( ranges.length > 1 ) {
				// we only support one range
				response.statusCode = 500;
				response.send("Server can only return one range");
				response.end();

			} else {
				response.statusCode = 206;
				
				let start = ranges[0].start;
				let end = ranges[0].end;

				response.setHeader( 'Content-Length', ( end - start ) + 1 ); // end is inclusive
				response.setHeader( 'Content-Range', 'bytes ' + start + '-' + end + '/' + stats.size );

				fileStream.pipe( rangeStream( start, end ) ).pipe( response );

			}
		} else {
			response.statusCode = 200;
			response.setHeader( 'Content-Length', stats.size );
			fileStream.pipe( response );
		}


		
	});
}
