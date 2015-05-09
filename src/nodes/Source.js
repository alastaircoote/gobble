import { basename, relative, resolve } from 'path';
import { link, linkSync, lsr, mkdir, mkdirSync, readFileSync, statSync, Promise } from 'sander';
import { crc32 } from 'crc';
import { watch } from 'graceful-chokidar';
import * as debounce from 'debounce';
import Node from './Node';
import uid from '../utils/uid';
import session from '../session';
import queue from '../queue';
import GobbleError from '../utils/GobbleError';

export default class Source extends Node {
	constructor ( dir, options = {} ) {
		super();

		this.id = options.id || 'source';
		this.dir = dir;
		this.checksumByFile = {};
		this.fileByChecksum = {};

		// Ensure the source exists, and is a directory
		try {
			const stats = statSync( this.dir );

			if ( !stats.isDirectory() ) {
				this.isFileSource = true;

				this.file = dir;
				this.dir = null;

				this.uid = uid( this.id );
			} else {
				// this._ready = Promise.resolve( this.dir );
			}
		} catch ( err ) {
			if ( err.code === 'ENOENT' ) {
				throw new GobbleError({
					code: 'MISSING_DIRECTORY',
					path: dir,
					message: `the ${dir} directory does not exist`
				});
			}

			throw err;
		}

		this.static = options && options.static;
	}

	ready () {
		if ( !this._ready ) {
			this._ready = queue.add( ( fulfil, reject ) => {
				const start = Date.now();

				this.emit( 'info', {
					code: 'CHECKSUM_START',
					progressIndicator: true,
					dir: this.dir
				});

				this._makeReady();

				lsr( this.dir )
					.then( files => {
						files.forEach( file => {
							const absolutePath = resolve( this.dir, file );
							const buffer = readFileSync( absolutePath );
							const checksum = crc32( buffer );

							this.checksumByFile[ absolutePath ] = checksum;
							this.fileByChecksum[ checksum ] = absolutePath;
						});
						this.emit( 'info', {
							code: 'CHECKSUM_COMPLETE',
							duration: Date.now() - start,
							dir: this.dir
						});
					})
					.then( () => fulfil( this.dir ) )
					.catch( reject );
			});
		}

		return this._ready;
	}

	startFileWatcher () {
		if ( this._active || this.static ) {
			return;
		}

		this._makeReady();

		this._active = true;

		let changes = [];

		const relay = debounce( () => {
			this.changes = changes.map( change => {
				const result = {
					file: relative( this.dir, change.path )
				};

				change.type === 'add'    && ( change.added = true );
				change.type === 'change' && ( change.changed = true );
				change.type === 'unlink' && ( change.removed = true );

				return result;
			});

			this.emit( 'invalidate', changes );
			changes = [];
		}, 100 );

		const options = {
			persistent: true,
			ignoreInitial: true,
			useFsEvents: false // see https://github.com/paulmillr/chokidar/issues/146
		};

		if ( this.isFileSource ) {
			this._watcher = watch( this.file, options );

			[ 'add', 'change' ].forEach( type => {
				this._watcher.on( type, path => {
					linkSync( this.file ).to( this.targetFile );
					changes.push({ type, path: this.targetFile });
					relay();
				});
			});

			this._watcher.on( 'unlink', () => {
				changes.push({ type: 'unlink', path: this.targetFile });
				unlinkSync( this.targetFile );
			});
		} else {
			this._watcher = watch( this.dir, options );

			[ 'add', 'change', 'unlink' ].forEach( type => {
				this._watcher.on( type, path => {
					changes.push({ type, path });
					relay();
				});
			});
		}
	}

	stopFileWatcher () {
		if ( this._watcher ) {
			this._watcher.close();
		}

		this._active = false;
	}

	teardown () {
		// noop
	}

	_findCreator ( filename ) {
		try {
			statSync( filename );
			return this;
		} catch ( err ) {
			return null;
		}
	}

	_makeReady () {
		if ( this.isFileSource && !this._isReady ) {
			this.dir = resolve( session.config.gobbledir, this.uid );
			this.targetFile = resolve( this.dir, basename( this.file ) );

			linkSync( this.file ).to( this.targetFile );
			this._isReady = true; // TODO less conflicty flag name
		}
	}
}
