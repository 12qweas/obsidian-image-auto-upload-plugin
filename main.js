'use strict';

var obsidian = require('obsidian');
var node_buffer = require('node:buffer');

var pathBrowserify;
var hasRequiredPathBrowserify;

function requirePathBrowserify () {
	if (hasRequiredPathBrowserify) return pathBrowserify;
	hasRequiredPathBrowserify = 1;

	function assertPath(path) {
	  if (typeof path !== 'string') {
	    throw new TypeError('Path must be a string. Received ' + JSON.stringify(path));
	  }
	}

	// Resolves . and .. elements in a path with directory names
	function normalizeStringPosix(path, allowAboveRoot) {
	  var res = '';
	  var lastSegmentLength = 0;
	  var lastSlash = -1;
	  var dots = 0;
	  var code;
	  for (var i = 0; i <= path.length; ++i) {
	    if (i < path.length)
	      code = path.charCodeAt(i);
	    else if (code === 47 /*/*/)
	      break;
	    else
	      code = 47 /*/*/;
	    if (code === 47 /*/*/) {
	      if (lastSlash === i - 1 || dots === 1) ; else if (lastSlash !== i - 1 && dots === 2) {
	        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ || res.charCodeAt(res.length - 2) !== 46 /*.*/) {
	          if (res.length > 2) {
	            var lastSlashIndex = res.lastIndexOf('/');
	            if (lastSlashIndex !== res.length - 1) {
	              if (lastSlashIndex === -1) {
	                res = '';
	                lastSegmentLength = 0;
	              } else {
	                res = res.slice(0, lastSlashIndex);
	                lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
	              }
	              lastSlash = i;
	              dots = 0;
	              continue;
	            }
	          } else if (res.length === 2 || res.length === 1) {
	            res = '';
	            lastSegmentLength = 0;
	            lastSlash = i;
	            dots = 0;
	            continue;
	          }
	        }
	        if (allowAboveRoot) {
	          if (res.length > 0)
	            res += '/..';
	          else
	            res = '..';
	          lastSegmentLength = 2;
	        }
	      } else {
	        if (res.length > 0)
	          res += '/' + path.slice(lastSlash + 1, i);
	        else
	          res = path.slice(lastSlash + 1, i);
	        lastSegmentLength = i - lastSlash - 1;
	      }
	      lastSlash = i;
	      dots = 0;
	    } else if (code === 46 /*.*/ && dots !== -1) {
	      ++dots;
	    } else {
	      dots = -1;
	    }
	  }
	  return res;
	}

	function _format(sep, pathObject) {
	  var dir = pathObject.dir || pathObject.root;
	  var base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');
	  if (!dir) {
	    return base;
	  }
	  if (dir === pathObject.root) {
	    return dir + base;
	  }
	  return dir + sep + base;
	}

	var posix = {
	  // path.resolve([from ...], to)
	  resolve: function resolve() {
	    var resolvedPath = '';
	    var resolvedAbsolute = false;
	    var cwd;

	    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
	      var path;
	      if (i >= 0)
	        path = arguments[i];
	      else {
	        if (cwd === undefined)
	          cwd = process.cwd();
	        path = cwd;
	      }

	      assertPath(path);

	      // Skip empty entries
	      if (path.length === 0) {
	        continue;
	      }

	      resolvedPath = path + '/' + resolvedPath;
	      resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    }

	    // At this point the path should be resolved to a full absolute path, but
	    // handle relative paths to be safe (might happen when process.cwd() fails)

	    // Normalize the path
	    resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);

	    if (resolvedAbsolute) {
	      if (resolvedPath.length > 0)
	        return '/' + resolvedPath;
	      else
	        return '/';
	    } else if (resolvedPath.length > 0) {
	      return resolvedPath;
	    } else {
	      return '.';
	    }
	  },

	  normalize: function normalize(path) {
	    assertPath(path);

	    if (path.length === 0) return '.';

	    var isAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    var trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/;

	    // Normalize the path
	    path = normalizeStringPosix(path, !isAbsolute);

	    if (path.length === 0 && !isAbsolute) path = '.';
	    if (path.length > 0 && trailingSeparator) path += '/';

	    if (isAbsolute) return '/' + path;
	    return path;
	  },

	  isAbsolute: function isAbsolute(path) {
	    assertPath(path);
	    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/;
	  },

	  join: function join() {
	    if (arguments.length === 0)
	      return '.';
	    var joined;
	    for (var i = 0; i < arguments.length; ++i) {
	      var arg = arguments[i];
	      assertPath(arg);
	      if (arg.length > 0) {
	        if (joined === undefined)
	          joined = arg;
	        else
	          joined += '/' + arg;
	      }
	    }
	    if (joined === undefined)
	      return '.';
	    return posix.normalize(joined);
	  },

	  relative: function relative(from, to) {
	    assertPath(from);
	    assertPath(to);

	    if (from === to) return '';

	    from = posix.resolve(from);
	    to = posix.resolve(to);

	    if (from === to) return '';

	    // Trim any leading backslashes
	    var fromStart = 1;
	    for (; fromStart < from.length; ++fromStart) {
	      if (from.charCodeAt(fromStart) !== 47 /*/*/)
	        break;
	    }
	    var fromEnd = from.length;
	    var fromLen = fromEnd - fromStart;

	    // Trim any leading backslashes
	    var toStart = 1;
	    for (; toStart < to.length; ++toStart) {
	      if (to.charCodeAt(toStart) !== 47 /*/*/)
	        break;
	    }
	    var toEnd = to.length;
	    var toLen = toEnd - toStart;

	    // Compare paths to find the longest common path from root
	    var length = fromLen < toLen ? fromLen : toLen;
	    var lastCommonSep = -1;
	    var i = 0;
	    for (; i <= length; ++i) {
	      if (i === length) {
	        if (toLen > length) {
	          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
	            // We get here if `from` is the exact base path for `to`.
	            // For example: from='/foo/bar'; to='/foo/bar/baz'
	            return to.slice(toStart + i + 1);
	          } else if (i === 0) {
	            // We get here if `from` is the root
	            // For example: from='/'; to='/foo'
	            return to.slice(toStart + i);
	          }
	        } else if (fromLen > length) {
	          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
	            // We get here if `to` is the exact base path for `from`.
	            // For example: from='/foo/bar/baz'; to='/foo/bar'
	            lastCommonSep = i;
	          } else if (i === 0) {
	            // We get here if `to` is the root.
	            // For example: from='/foo'; to='/'
	            lastCommonSep = 0;
	          }
	        }
	        break;
	      }
	      var fromCode = from.charCodeAt(fromStart + i);
	      var toCode = to.charCodeAt(toStart + i);
	      if (fromCode !== toCode)
	        break;
	      else if (fromCode === 47 /*/*/)
	        lastCommonSep = i;
	    }

	    var out = '';
	    // Generate the relative path based on the path difference between `to`
	    // and `from`
	    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
	      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
	        if (out.length === 0)
	          out += '..';
	        else
	          out += '/..';
	      }
	    }

	    // Lastly, append the rest of the destination (`to`) path that comes after
	    // the common path parts
	    if (out.length > 0)
	      return out + to.slice(toStart + lastCommonSep);
	    else {
	      toStart += lastCommonSep;
	      if (to.charCodeAt(toStart) === 47 /*/*/)
	        ++toStart;
	      return to.slice(toStart);
	    }
	  },

	  _makeLong: function _makeLong(path) {
	    return path;
	  },

	  dirname: function dirname(path) {
	    assertPath(path);
	    if (path.length === 0) return '.';
	    var code = path.charCodeAt(0);
	    var hasRoot = code === 47 /*/*/;
	    var end = -1;
	    var matchedSlash = true;
	    for (var i = path.length - 1; i >= 1; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          if (!matchedSlash) {
	            end = i;
	            break;
	          }
	        } else {
	        // We saw the first non-path separator
	        matchedSlash = false;
	      }
	    }

	    if (end === -1) return hasRoot ? '/' : '.';
	    if (hasRoot && end === 1) return '//';
	    return path.slice(0, end);
	  },

	  basename: function basename(path, ext) {
	    if (ext !== undefined && typeof ext !== 'string') throw new TypeError('"ext" argument must be a string');
	    assertPath(path);

	    var start = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i;

	    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
	      if (ext.length === path.length && ext === path) return '';
	      var extIdx = ext.length - 1;
	      var firstNonSlashEnd = -1;
	      for (i = path.length - 1; i >= 0; --i) {
	        var code = path.charCodeAt(i);
	        if (code === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else {
	          if (firstNonSlashEnd === -1) {
	            // We saw the first non-path separator, remember this index in case
	            // we need it if the extension ends up not matching
	            matchedSlash = false;
	            firstNonSlashEnd = i + 1;
	          }
	          if (extIdx >= 0) {
	            // Try to match the explicit extension
	            if (code === ext.charCodeAt(extIdx)) {
	              if (--extIdx === -1) {
	                // We matched the extension, so mark this as the end of our path
	                // component
	                end = i;
	              }
	            } else {
	              // Extension does not match, so our result is the entire path
	              // component
	              extIdx = -1;
	              end = firstNonSlashEnd;
	            }
	          }
	        }
	      }

	      if (start === end) end = firstNonSlashEnd;else if (end === -1) end = path.length;
	      return path.slice(start, end);
	    } else {
	      for (i = path.length - 1; i >= 0; --i) {
	        if (path.charCodeAt(i) === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else if (end === -1) {
	          // We saw the first non-path separator, mark this as the end of our
	          // path component
	          matchedSlash = false;
	          end = i + 1;
	        }
	      }

	      if (end === -1) return '';
	      return path.slice(start, end);
	    }
	  },

	  extname: function extname(path) {
	    assertPath(path);
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;
	    for (var i = path.length - 1; i >= 0; --i) {
	      var code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1)
	            startDot = i;
	          else if (preDotState !== 1)
	            preDotState = 1;
	      } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	        // We saw a non-dot character immediately before the dot
	        preDotState === 0 ||
	        // The (right-most) trimmed path component is exactly '..'
	        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      return '';
	    }
	    return path.slice(startDot, end);
	  },

	  format: function format(pathObject) {
	    if (pathObject === null || typeof pathObject !== 'object') {
	      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
	    }
	    return _format('/', pathObject);
	  },

	  parse: function parse(path) {
	    assertPath(path);

	    var ret = { root: '', dir: '', base: '', ext: '', name: '' };
	    if (path.length === 0) return ret;
	    var code = path.charCodeAt(0);
	    var isAbsolute = code === 47 /*/*/;
	    var start;
	    if (isAbsolute) {
	      ret.root = '/';
	      start = 1;
	    } else {
	      start = 0;
	    }
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i = path.length - 1;

	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;

	    // Get non-dir info
	    for (; i >= start; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1) startDot = i;else if (preDotState !== 1) preDotState = 1;
	        } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	    // We saw a non-dot character immediately before the dot
	    preDotState === 0 ||
	    // The (right-most) trimmed path component is exactly '..'
	    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      if (end !== -1) {
	        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end);else ret.base = ret.name = path.slice(startPart, end);
	      }
	    } else {
	      if (startPart === 0 && isAbsolute) {
	        ret.name = path.slice(1, startDot);
	        ret.base = path.slice(1, end);
	      } else {
	        ret.name = path.slice(startPart, startDot);
	        ret.base = path.slice(startPart, end);
	      }
	      ret.ext = path.slice(startDot, end);
	    }

	    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);else if (isAbsolute) ret.dir = '/';

	    return ret;
	  },

	  sep: '/',
	  delimiter: ':',
	  win32: null,
	  posix: null
	};

	posix.posix = posix;

	pathBrowserify = posix;
	return pathBrowserify;
}

var pathBrowserifyExports = requirePathBrowserify();

const IMAGE_EXT_LIST = [
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".svg",
    ".tiff",
    ".webp",
    ".avif",
];
function isAnImage(ext) {
    return IMAGE_EXT_LIST.includes(ext.toLowerCase());
}
function isAssetTypeAnImage(path) {
    return isAnImage(pathBrowserifyExports.extname(path));
}
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    // @ts-ignore
    return Buffer.concat(chunks).toString("utf-8");
}
function getUrlAsset(url) {
    return (url = url.substr(1 + url.lastIndexOf("/")).split("?")[0]).split("#")[0];
}
function getLastImage(list) {
    const reversedList = list.reverse();
    let lastImage;
    reversedList.forEach(item => {
        if (item && item.startsWith("http")) {
            lastImage = item;
            return item;
        }
    });
    return lastImage;
}
function arrayToObject(arr, key) {
    const obj = {};
    arr.forEach(element => {
        obj[element[key]] = element;
    });
    return obj;
}
function bufferToArrayBuffer(buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
        view[i] = buffer[i];
    }
    return arrayBuffer;
}
function uuid() {
    return Math.random().toString(36).slice(2);
}

// Primitive types
function dv(array) {
    return new DataView(array.buffer, array.byteOffset);
}
/**
 * 8-bit unsigned integer
 */
const UINT8 = {
    len: 1,
    get(array, offset) {
        return dv(array).getUint8(offset);
    },
    put(array, offset, value) {
        dv(array).setUint8(offset, value);
        return offset + 1;
    }
};
/**
 * 16-bit unsigned integer, Little Endian byte order
 */
const UINT16_LE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value, true);
        return offset + 2;
    }
};
/**
 * 16-bit unsigned integer, Big Endian byte order
 */
const UINT16_BE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value);
        return offset + 2;
    }
};
/**
 * 32-bit unsigned integer, Little Endian byte order
 */
const UINT32_LE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value, true);
        return offset + 4;
    }
};
/**
 * 32-bit unsigned integer, Big Endian byte order
 */
const UINT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value);
        return offset + 4;
    }
};
/**
 * 32-bit signed integer, Big Endian byte order
 */
const INT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getInt32(offset);
    },
    put(array, offset, value) {
        dv(array).setInt32(offset, value);
        return offset + 4;
    }
};
/**
 * 64-bit unsigned integer, Little Endian byte order
 */
const UINT64_LE = {
    len: 8,
    get(array, offset) {
        return dv(array).getBigUint64(offset, true);
    },
    put(array, offset, value) {
        dv(array).setBigUint64(offset, value, true);
        return offset + 8;
    }
};
/**
 * Consume a fixed number of bytes from the stream and return a string with a specified encoding.
 */
class StringType {
    constructor(len, encoding) {
        this.len = len;
        this.encoding = encoding;
    }
    get(uint8Array, offset) {
        return node_buffer.Buffer.from(uint8Array).toString(this.encoding, offset, offset + this.len);
    }
}

const defaultMessages = 'End-Of-Stream';
/**
 * Thrown on read operation of the end of file or stream has been reached
 */
class EndOfStreamError extends Error {
    constructor() {
        super(defaultMessages);
    }
}

class Deferred {
    constructor() {
        this.resolve = () => null;
        this.reject = () => null;
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}

class AbstractStreamReader {
    constructor() {
        /**
         * Maximum request length on read-stream operation
         */
        this.maxStreamReadSize = 1 * 1024 * 1024;
        this.endOfStream = false;
        /**
         * Store peeked data
         * @type {Array}
         */
        this.peekQueue = [];
    }
    async peek(uint8Array, offset, length) {
        const bytesRead = await this.read(uint8Array, offset, length);
        this.peekQueue.push(uint8Array.subarray(offset, offset + bytesRead)); // Put read data back to peek buffer
        return bytesRead;
    }
    async read(buffer, offset, length) {
        if (length === 0) {
            return 0;
        }
        let bytesRead = this.readFromPeekBuffer(buffer, offset, length);
        bytesRead += await this.readRemainderFromStream(buffer, offset + bytesRead, length - bytesRead);
        if (bytesRead === 0) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Read chunk from stream
     * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset - Offset target
     * @param length - Number of bytes to read
     * @returns Number of bytes read
     */
    readFromPeekBuffer(buffer, offset, length) {
        let remaining = length;
        let bytesRead = 0;
        // consume peeked data first
        while (this.peekQueue.length > 0 && remaining > 0) {
            const peekData = this.peekQueue.pop(); // Front of queue
            if (!peekData)
                throw new Error('peekData should be defined');
            const lenCopy = Math.min(peekData.length, remaining);
            buffer.set(peekData.subarray(0, lenCopy), offset + bytesRead);
            bytesRead += lenCopy;
            remaining -= lenCopy;
            if (lenCopy < peekData.length) {
                // remainder back to queue
                this.peekQueue.push(peekData.subarray(lenCopy));
            }
        }
        return bytesRead;
    }
    async readRemainderFromStream(buffer, offset, initialRemaining) {
        let remaining = initialRemaining;
        let bytesRead = 0;
        // Continue reading from stream if required
        while (remaining > 0 && !this.endOfStream) {
            const reqLen = Math.min(remaining, this.maxStreamReadSize);
            const chunkLen = await this.readFromStream(buffer, offset + bytesRead, reqLen);
            if (chunkLen === 0)
                break;
            bytesRead += chunkLen;
            remaining -= chunkLen;
        }
        return bytesRead;
    }
}

/**
 * Node.js Readable Stream Reader
 * Ref: https://nodejs.org/api/stream.html#readable-streams
 */
class StreamReader extends AbstractStreamReader {
    constructor(s) {
        super();
        this.s = s;
        /**
         * Deferred used for postponed read request (as not data is yet available to read)
         */
        this.deferred = null;
        if (!s.read || !s.once) {
            throw new Error('Expected an instance of stream.Readable');
        }
        this.s.once('end', () => this.reject(new EndOfStreamError()));
        this.s.once('error', err => this.reject(err));
        this.s.once('close', () => this.reject(new Error('Stream closed')));
    }
    /**
     * Read chunk from stream
     * @param buffer Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset Offset target
     * @param length Number of bytes to read
     * @returns Number of bytes read
     */
    async readFromStream(buffer, offset, length) {
        if (this.endOfStream) {
            return 0;
        }
        const readBuffer = this.s.read(length);
        if (readBuffer) {
            buffer.set(readBuffer, offset);
            return readBuffer.length;
        }
        const request = {
            buffer,
            offset,
            length,
            deferred: new Deferred()
        };
        this.deferred = request.deferred;
        this.s.once('readable', () => {
            this.readDeferred(request);
        });
        return request.deferred.promise;
    }
    /**
     * Process deferred read request
     * @param request Deferred read request
     */
    readDeferred(request) {
        const readBuffer = this.s.read(request.length);
        if (readBuffer) {
            request.buffer.set(readBuffer, request.offset);
            request.deferred.resolve(readBuffer.length);
            this.deferred = null;
        }
        else {
            this.s.once('readable', () => {
                this.readDeferred(request);
            });
        }
    }
    reject(err) {
        this.endOfStream = true;
        if (this.deferred) {
            this.deferred.reject(err);
            this.deferred = null;
        }
    }
    async abort() {
        this.s.destroy();
    }
}

/**
 * Core tokenizer
 */
class AbstractTokenizer {
    constructor(fileInfo) {
        /**
         * Tokenizer-stream position
         */
        this.position = 0;
        this.numBuffer = new Uint8Array(8);
        this.fileInfo = fileInfo ? fileInfo : {};
    }
    /**
     * Read a token from the tokenizer-stream
     * @param token - The token to read
     * @param position - If provided, the desired position in the tokenizer-stream
     * @returns Promise with token data
     */
    async readToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.readBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Peek a token from the tokenizer-stream.
     * @param token - Token to peek from the tokenizer-stream.
     * @param position - Offset where to begin reading within the file. If position is null, data will be read from the current file position.
     * @returns Promise with token data
     */
    async peekToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.peekBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async readNumber(token) {
        const len = await this.readBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async peekNumber(token) {
        const len = await this.peekBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Ignore number of bytes, advances the pointer in under tokenizer-stream.
     * @param length - Number of bytes to ignore
     * @return resolves the number of bytes ignored, equals length if this available, otherwise the number of bytes available
     */
    async ignore(length) {
        if (this.fileInfo.size !== undefined) {
            const bytesLeft = this.fileInfo.size - this.position;
            if (length > bytesLeft) {
                this.position += bytesLeft;
                return bytesLeft;
            }
        }
        this.position += length;
        return length;
    }
    async close() {
        // empty
    }
    normalizeOptions(uint8Array, options) {
        if (options && options.position !== undefined && options.position < this.position) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (options) {
            return {
                mayBeLess: options.mayBeLess === true,
                offset: options.offset ? options.offset : 0,
                length: options.length ? options.length : (uint8Array.length - (options.offset ? options.offset : 0)),
                position: options.position ? options.position : this.position
            };
        }
        return {
            mayBeLess: false,
            offset: 0,
            length: uint8Array.length,
            position: this.position
        };
    }
}

const maxBufferSize = 256000;
class ReadStreamTokenizer extends AbstractTokenizer {
    constructor(streamReader, fileInfo) {
        super(fileInfo);
        this.streamReader = streamReader;
    }
    /**
     * Get file information, an HTTP-client may implement this doing a HEAD request
     * @return Promise with file information
     */
    async getFileInfo() {
        return this.fileInfo;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Target Uint8Array to fill with data read from the tokenizer-stream
     * @param options - Read behaviour options
     * @returns Promise with number of bytes read
     */
    async readBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const skipBytes = normOptions.position - this.position;
        if (skipBytes > 0) {
            await this.ignore(skipBytes);
            return this.readBuffer(uint8Array, options);
        }
        else if (skipBytes < 0) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (normOptions.length === 0) {
            return 0;
        }
        const bytesRead = await this.streamReader.read(uint8Array, normOptions.offset, normOptions.length);
        this.position += bytesRead;
        if ((!options || !options.mayBeLess) && bytesRead < normOptions.length) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array - Uint8Array (or Buffer) to write data to
     * @param options - Read behaviour options
     * @returns Promise with number of bytes peeked
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        let bytesRead = 0;
        if (normOptions.position) {
            const skipBytes = normOptions.position - this.position;
            if (skipBytes > 0) {
                const skipBuffer = new Uint8Array(normOptions.length + skipBytes);
                bytesRead = await this.peekBuffer(skipBuffer, { mayBeLess: normOptions.mayBeLess });
                uint8Array.set(skipBuffer.subarray(skipBytes), normOptions.offset);
                return bytesRead - skipBytes;
            }
            else if (skipBytes < 0) {
                throw new Error('Cannot peek from a negative offset in a stream');
            }
        }
        if (normOptions.length > 0) {
            try {
                bytesRead = await this.streamReader.peek(uint8Array, normOptions.offset, normOptions.length);
            }
            catch (err) {
                if (options && options.mayBeLess && err instanceof EndOfStreamError) {
                    return 0;
                }
                throw err;
            }
            if ((!normOptions.mayBeLess) && bytesRead < normOptions.length) {
                throw new EndOfStreamError();
            }
        }
        return bytesRead;
    }
    async ignore(length) {
        // debug(`ignore ${this.position}...${this.position + length - 1}`);
        const bufSize = Math.min(maxBufferSize, length);
        const buf = new Uint8Array(bufSize);
        let totBytesRead = 0;
        while (totBytesRead < length) {
            const remaining = length - totBytesRead;
            const bytesRead = await this.readBuffer(buf, { length: Math.min(bufSize, remaining) });
            if (bytesRead < 0) {
                return bytesRead;
            }
            totBytesRead += bytesRead;
        }
        return totBytesRead;
    }
}

class BufferTokenizer extends AbstractTokenizer {
    /**
     * Construct BufferTokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param fileInfo - Pass additional file information to the tokenizer
     */
    constructor(uint8Array, fileInfo) {
        super(fileInfo);
        this.uint8Array = uint8Array;
        this.fileInfo.size = this.fileInfo.size ? this.fileInfo.size : uint8Array.length;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async readBuffer(uint8Array, options) {
        if (options && options.position) {
            if (options.position < this.position) {
                throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
            }
            this.position = options.position;
        }
        const bytesRead = await this.peekBuffer(uint8Array, options);
        this.position += bytesRead;
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const bytes2read = Math.min(this.uint8Array.length - normOptions.position, normOptions.length);
        if ((!normOptions.mayBeLess) && bytes2read < normOptions.length) {
            throw new EndOfStreamError();
        }
        else {
            uint8Array.set(this.uint8Array.subarray(normOptions.position, normOptions.position + bytes2read), normOptions.offset);
            return bytes2read;
        }
    }
    async close() {
        // empty
    }
}

/**
 * Construct ReadStreamTokenizer from given Stream.
 * Will set fileSize, if provided given Stream has set the .path property/
 * @param stream - Read from Node.js Stream.Readable
 * @param fileInfo - Pass the file information, like size and MIME-type of the corresponding stream.
 * @returns ReadStreamTokenizer
 */
function fromStream(stream, fileInfo) {
    fileInfo = fileInfo ? fileInfo : {};
    return new ReadStreamTokenizer(new StreamReader(stream), fileInfo);
}
/**
 * Construct ReadStreamTokenizer from given Buffer.
 * @param uint8Array - Uint8Array to tokenize
 * @param fileInfo - Pass additional file information to the tokenizer
 * @returns BufferTokenizer
 */
function fromBuffer(uint8Array, fileInfo) {
    return new BufferTokenizer(uint8Array, fileInfo);
}

function stringToBytes(string) {
	return [...string].map(character => character.charCodeAt(0)); // eslint-disable-line unicorn/prefer-code-point
}

/**
Checks whether the TAR checksum is valid.

@param {Buffer} buffer - The TAR header `[offset ... offset + 512]`.
@param {number} offset - TAR header offset.
@returns {boolean} `true` if the TAR checksum is valid, otherwise `false`.
*/
function tarHeaderChecksumMatches(buffer, offset = 0) {
	const readSum = Number.parseInt(buffer.toString('utf8', 148, 154).replace(/\0.*$/, '').trim(), 8); // Read sum in header
	if (Number.isNaN(readSum)) {
		return false;
	}

	let sum = 8 * 0x20; // Initialize signed bit sum

	for (let index = offset; index < offset + 148; index++) {
		sum += buffer[index];
	}

	for (let index = offset + 156; index < offset + 512; index++) {
		sum += buffer[index];
	}

	return readSum === sum;
}

/**
ID3 UINT32 sync-safe tokenizer token.
28 bits (representing up to 256MB) integer, the msb is 0 to avoid "false syncsignals".
*/
const uint32SyncSafeToken = {
	get: (buffer, offset) => (buffer[offset + 3] & 0x7F) | ((buffer[offset + 2]) << 7) | ((buffer[offset + 1]) << 14) | ((buffer[offset]) << 21),
	len: 4,
};

const extensions = [
	'jpg',
	'png',
	'apng',
	'gif',
	'webp',
	'flif',
	'xcf',
	'cr2',
	'cr3',
	'orf',
	'arw',
	'dng',
	'nef',
	'rw2',
	'raf',
	'tif',
	'bmp',
	'icns',
	'jxr',
	'psd',
	'indd',
	'zip',
	'tar',
	'rar',
	'gz',
	'bz2',
	'7z',
	'dmg',
	'mp4',
	'mid',
	'mkv',
	'webm',
	'mov',
	'avi',
	'mpg',
	'mp2',
	'mp3',
	'm4a',
	'oga',
	'ogg',
	'ogv',
	'opus',
	'flac',
	'wav',
	'spx',
	'amr',
	'pdf',
	'epub',
	'elf',
	'macho',
	'exe',
	'swf',
	'rtf',
	'wasm',
	'woff',
	'woff2',
	'eot',
	'ttf',
	'otf',
	'ico',
	'flv',
	'ps',
	'xz',
	'sqlite',
	'nes',
	'crx',
	'xpi',
	'cab',
	'deb',
	'ar',
	'rpm',
	'Z',
	'lz',
	'cfb',
	'mxf',
	'mts',
	'blend',
	'bpg',
	'docx',
	'pptx',
	'xlsx',
	'3gp',
	'3g2',
	'j2c',
	'jp2',
	'jpm',
	'jpx',
	'mj2',
	'aif',
	'qcp',
	'odt',
	'ods',
	'odp',
	'xml',
	'mobi',
	'heic',
	'cur',
	'ktx',
	'ape',
	'wv',
	'dcm',
	'ics',
	'glb',
	'pcap',
	'dsf',
	'lnk',
	'alias',
	'voc',
	'ac3',
	'm4v',
	'm4p',
	'm4b',
	'f4v',
	'f4p',
	'f4b',
	'f4a',
	'mie',
	'asf',
	'ogm',
	'ogx',
	'mpc',
	'arrow',
	'shp',
	'aac',
	'mp1',
	'it',
	's3m',
	'xm',
	'ai',
	'skp',
	'avif',
	'eps',
	'lzh',
	'pgp',
	'asar',
	'stl',
	'chm',
	'3mf',
	'zst',
	'jxl',
	'vcf',
	'jls',
	'pst',
	'dwg',
	'parquet',
	'class',
	'arj',
	'cpio',
	'ace',
	'avro',
	'icc',
	'fbx',
];

const mimeTypes = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/flif',
	'image/x-xcf',
	'image/x-canon-cr2',
	'image/x-canon-cr3',
	'image/tiff',
	'image/bmp',
	'image/vnd.ms-photo',
	'image/vnd.adobe.photoshop',
	'application/x-indesign',
	'application/epub+zip',
	'application/x-xpinstall',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/zip',
	'application/x-tar',
	'application/x-rar-compressed',
	'application/gzip',
	'application/x-bzip2',
	'application/x-7z-compressed',
	'application/x-apple-diskimage',
	'application/x-apache-arrow',
	'video/mp4',
	'audio/midi',
	'video/x-matroska',
	'video/webm',
	'video/quicktime',
	'video/vnd.avi',
	'audio/vnd.wave',
	'audio/qcelp',
	'audio/x-ms-asf',
	'video/x-ms-asf',
	'application/vnd.ms-asf',
	'video/mpeg',
	'video/3gpp',
	'audio/mpeg',
	'audio/mp4', // RFC 4337
	'audio/opus',
	'video/ogg',
	'audio/ogg',
	'application/ogg',
	'audio/x-flac',
	'audio/ape',
	'audio/wavpack',
	'audio/amr',
	'application/pdf',
	'application/x-elf',
	'application/x-mach-binary',
	'application/x-msdownload',
	'application/x-shockwave-flash',
	'application/rtf',
	'application/wasm',
	'font/woff',
	'font/woff2',
	'application/vnd.ms-fontobject',
	'font/ttf',
	'font/otf',
	'image/x-icon',
	'video/x-flv',
	'application/postscript',
	'application/eps',
	'application/x-xz',
	'application/x-sqlite3',
	'application/x-nintendo-nes-rom',
	'application/x-google-chrome-extension',
	'application/vnd.ms-cab-compressed',
	'application/x-deb',
	'application/x-unix-archive',
	'application/x-rpm',
	'application/x-compress',
	'application/x-lzip',
	'application/x-cfb',
	'application/x-mie',
	'application/mxf',
	'video/mp2t',
	'application/x-blender',
	'image/bpg',
	'image/j2c',
	'image/jp2',
	'image/jpx',
	'image/jpm',
	'image/mj2',
	'audio/aiff',
	'application/xml',
	'application/x-mobipocket-ebook',
	'image/heif',
	'image/heif-sequence',
	'image/heic',
	'image/heic-sequence',
	'image/icns',
	'image/ktx',
	'application/dicom',
	'audio/x-musepack',
	'text/calendar',
	'text/vcard',
	'model/gltf-binary',
	'application/vnd.tcpdump.pcap',
	'audio/x-dsf', // Non-standard
	'application/x.ms.shortcut', // Invented by us
	'application/x.apple.alias', // Invented by us
	'audio/x-voc',
	'audio/vnd.dolby.dd-raw',
	'audio/x-m4a',
	'image/apng',
	'image/x-olympus-orf',
	'image/x-sony-arw',
	'image/x-adobe-dng',
	'image/x-nikon-nef',
	'image/x-panasonic-rw2',
	'image/x-fujifilm-raf',
	'video/x-m4v',
	'video/3gpp2',
	'application/x-esri-shape',
	'audio/aac',
	'audio/x-it',
	'audio/x-s3m',
	'audio/x-xm',
	'video/MP1S',
	'video/MP2P',
	'application/vnd.sketchup.skp',
	'image/avif',
	'application/x-lzh-compressed',
	'application/pgp-encrypted',
	'application/x-asar',
	'model/stl',
	'application/vnd.ms-htmlhelp',
	'model/3mf',
	'image/jxl',
	'application/zstd',
	'image/jls',
	'application/vnd.ms-outlook',
	'image/vnd.dwg',
	'application/x-parquet',
	'application/java-vm',
	'application/x-arj',
	'application/x-cpio',
	'application/x-ace-compressed',
	'application/avro',
	'application/vnd.iccprofile',
	'application/x.autodesk.fbx', // Invented by us
];

const minimumBytes = 4100; // A fair amount of file-types are detectable within this range.

async function fileTypeFromBuffer(input) {
	return new FileTypeParser().fromBuffer(input);
}

function _check(buffer, headers, options) {
	options = {
		offset: 0,
		...options,
	};

	for (const [index, header] of headers.entries()) {
		// If a bitmask is set
		if (options.mask) {
			// If header doesn't equal `buf` with bits masked off
			if (header !== (options.mask[index] & buffer[index + options.offset])) {
				return false;
			}
		} else if (header !== buffer[index + options.offset]) {
			return false;
		}
	}

	return true;
}

class FileTypeParser {
	constructor(options) {
		this.detectors = options?.customDetectors;

		this.fromTokenizer = this.fromTokenizer.bind(this);
		this.fromBuffer = this.fromBuffer.bind(this);
		this.parse = this.parse.bind(this);
	}

	async fromTokenizer(tokenizer) {
		const initialPosition = tokenizer.position;

		for (const detector of this.detectors || []) {
			const fileType = await detector(tokenizer);
			if (fileType) {
				return fileType;
			}

			if (initialPosition !== tokenizer.position) {
				return undefined; // Cannot proceed scanning of the tokenizer is at an arbitrary position
			}
		}

		return this.parse(tokenizer);
	}

	async fromBuffer(input) {
		if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) {
			throw new TypeError(`Expected the \`input\` argument to be of type \`Uint8Array\` or \`Buffer\` or \`ArrayBuffer\`, got \`${typeof input}\``);
		}

		const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

		if (!(buffer?.length > 1)) {
			return;
		}

		return this.fromTokenizer(fromBuffer(buffer));
	}

	async fromBlob(blob) {
		const buffer = await blob.arrayBuffer();
		return this.fromBuffer(new Uint8Array(buffer));
	}

	async fromStream(stream) {
		const tokenizer = await fromStream(stream);
		try {
			return await this.fromTokenizer(tokenizer);
		} finally {
			await tokenizer.close();
		}
	}

	async toDetectionStream(readableStream, options = {}) {
		const {default: stream} = await import('node:stream');
		const {sampleSize = minimumBytes} = options;

		return new Promise((resolve, reject) => {
			readableStream.on('error', reject);

			readableStream.once('readable', () => {
				(async () => {
					try {
						// Set up output stream
						const pass = new stream.PassThrough();
						const outputStream = stream.pipeline ? stream.pipeline(readableStream, pass, () => {}) : readableStream.pipe(pass);

						// Read the input stream and detect the filetype
						const chunk = readableStream.read(sampleSize) ?? readableStream.read() ?? node_buffer.Buffer.alloc(0);
						try {
							pass.fileType = await this.fromBuffer(chunk);
						} catch (error) {
							if (error instanceof EndOfStreamError) {
								pass.fileType = undefined;
							} else {
								reject(error);
							}
						}

						resolve(outputStream);
					} catch (error) {
						reject(error);
					}
				})();
			});
		});
	}

	check(header, options) {
		return _check(this.buffer, header, options);
	}

	checkString(header, options) {
		return this.check(stringToBytes(header), options);
	}

	async parse(tokenizer) {
		this.buffer = node_buffer.Buffer.alloc(minimumBytes);

		// Keep reading until EOF if the file size is unknown.
		if (tokenizer.fileInfo.size === undefined) {
			tokenizer.fileInfo.size = Number.MAX_SAFE_INTEGER;
		}

		this.tokenizer = tokenizer;

		await tokenizer.peekBuffer(this.buffer, {length: 12, mayBeLess: true});

		// -- 2-byte signatures --

		if (this.check([0x42, 0x4D])) {
			return {
				ext: 'bmp',
				mime: 'image/bmp',
			};
		}

		if (this.check([0x0B, 0x77])) {
			return {
				ext: 'ac3',
				mime: 'audio/vnd.dolby.dd-raw',
			};
		}

		if (this.check([0x78, 0x01])) {
			return {
				ext: 'dmg',
				mime: 'application/x-apple-diskimage',
			};
		}

		if (this.check([0x4D, 0x5A])) {
			return {
				ext: 'exe',
				mime: 'application/x-msdownload',
			};
		}

		if (this.check([0x25, 0x21])) {
			await tokenizer.peekBuffer(this.buffer, {length: 24, mayBeLess: true});

			if (
				this.checkString('PS-Adobe-', {offset: 2})
				&& this.checkString(' EPSF-', {offset: 14})
			) {
				return {
					ext: 'eps',
					mime: 'application/eps',
				};
			}

			return {
				ext: 'ps',
				mime: 'application/postscript',
			};
		}

		if (
			this.check([0x1F, 0xA0])
			|| this.check([0x1F, 0x9D])
		) {
			return {
				ext: 'Z',
				mime: 'application/x-compress',
			};
		}

		if (this.check([0xC7, 0x71])) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		if (this.check([0x60, 0xEA])) {
			return {
				ext: 'arj',
				mime: 'application/x-arj',
			};
		}

		// -- 3-byte signatures --

		if (this.check([0xEF, 0xBB, 0xBF])) { // UTF-8-BOM
			// Strip off UTF-8-BOM
			this.tokenizer.ignore(3);
			return this.parse(tokenizer);
		}

		if (this.check([0x47, 0x49, 0x46])) {
			return {
				ext: 'gif',
				mime: 'image/gif',
			};
		}

		if (this.check([0x49, 0x49, 0xBC])) {
			return {
				ext: 'jxr',
				mime: 'image/vnd.ms-photo',
			};
		}

		if (this.check([0x1F, 0x8B, 0x8])) {
			return {
				ext: 'gz',
				mime: 'application/gzip',
			};
		}

		if (this.check([0x42, 0x5A, 0x68])) {
			return {
				ext: 'bz2',
				mime: 'application/x-bzip2',
			};
		}

		if (this.checkString('ID3')) {
			await tokenizer.ignore(6); // Skip ID3 header until the header size
			const id3HeaderLength = await tokenizer.readToken(uint32SyncSafeToken);
			if (tokenizer.position + id3HeaderLength > tokenizer.fileInfo.size) {
				// Guess file type based on ID3 header for backward compatibility
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			await tokenizer.ignore(id3HeaderLength);
			return this.fromTokenizer(tokenizer); // Skip ID3 header, recursion
		}

		// Musepack, SV7
		if (this.checkString('MP+')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (
			(this.buffer[0] === 0x43 || this.buffer[0] === 0x46)
			&& this.check([0x57, 0x53], {offset: 1})
		) {
			return {
				ext: 'swf',
				mime: 'application/x-shockwave-flash',
			};
		}

		// -- 4-byte signatures --

		// Requires a sample size of 4 bytes
		if (this.check([0xFF, 0xD8, 0xFF])) {
			if (this.check([0xF7], {offset: 3})) { // JPG7/SOF55, indicating a ISO/IEC 14495 / JPEG-LS file
				return {
					ext: 'jls',
					mime: 'image/jls',
				};
			}

			return {
				ext: 'jpg',
				mime: 'image/jpeg',
			};
		}

		if (this.check([0x4F, 0x62, 0x6A, 0x01])) {
			return {
				ext: 'avro',
				mime: 'application/avro',
			};
		}

		if (this.checkString('FLIF')) {
			return {
				ext: 'flif',
				mime: 'image/flif',
			};
		}

		if (this.checkString('8BPS')) {
			return {
				ext: 'psd',
				mime: 'image/vnd.adobe.photoshop',
			};
		}

		if (this.checkString('WEBP', {offset: 8})) {
			return {
				ext: 'webp',
				mime: 'image/webp',
			};
		}

		// Musepack, SV8
		if (this.checkString('MPCK')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (this.checkString('FORM')) {
			return {
				ext: 'aif',
				mime: 'audio/aiff',
			};
		}

		if (this.checkString('icns', {offset: 0})) {
			return {
				ext: 'icns',
				mime: 'image/icns',
			};
		}

		// Zip-based file formats
		// Need to be before the `zip` check
		if (this.check([0x50, 0x4B, 0x3, 0x4])) { // Local file header signature
			try {
				while (tokenizer.position + 30 < tokenizer.fileInfo.size) {
					await tokenizer.readBuffer(this.buffer, {length: 30});

					// https://en.wikipedia.org/wiki/Zip_(file_format)#File_headers
					const zipHeader = {
						compressedSize: this.buffer.readUInt32LE(18),
						uncompressedSize: this.buffer.readUInt32LE(22),
						filenameLength: this.buffer.readUInt16LE(26),
						extraFieldLength: this.buffer.readUInt16LE(28),
					};

					zipHeader.filename = await tokenizer.readToken(new StringType(zipHeader.filenameLength, 'utf-8'));
					await tokenizer.ignore(zipHeader.extraFieldLength);

					// Assumes signed `.xpi` from addons.mozilla.org
					if (zipHeader.filename === 'META-INF/mozilla.rsa') {
						return {
							ext: 'xpi',
							mime: 'application/x-xpinstall',
						};
					}

					if (zipHeader.filename.endsWith('.rels') || zipHeader.filename.endsWith('.xml')) {
						const type = zipHeader.filename.split('/')[0];
						switch (type) {
							case '_rels':
								break;
							case 'word':
								return {
									ext: 'docx',
									mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
								};
							case 'ppt':
								return {
									ext: 'pptx',
									mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
								};
							case 'xl':
								return {
									ext: 'xlsx',
									mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
								};
							default:
								break;
						}
					}

					if (zipHeader.filename.startsWith('xl/')) {
						return {
							ext: 'xlsx',
							mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						};
					}

					if (zipHeader.filename.startsWith('3D/') && zipHeader.filename.endsWith('.model')) {
						return {
							ext: '3mf',
							mime: 'model/3mf',
						};
					}

					// The docx, xlsx and pptx file types extend the Office Open XML file format:
					// https://en.wikipedia.org/wiki/Office_Open_XML_file_formats
					// We look for:
					// - one entry named '[Content_Types].xml' or '_rels/.rels',
					// - one entry indicating specific type of file.
					// MS Office, OpenOffice and LibreOffice may put the parts in different order, so the check should not rely on it.
					if (zipHeader.filename === 'mimetype' && zipHeader.compressedSize === zipHeader.uncompressedSize) {
						let mimeType = await tokenizer.readToken(new StringType(zipHeader.compressedSize, 'utf-8'));
						mimeType = mimeType.trim();

						switch (mimeType) {
							case 'application/epub+zip':
								return {
									ext: 'epub',
									mime: 'application/epub+zip',
								};
							case 'application/vnd.oasis.opendocument.text':
								return {
									ext: 'odt',
									mime: 'application/vnd.oasis.opendocument.text',
								};
							case 'application/vnd.oasis.opendocument.spreadsheet':
								return {
									ext: 'ods',
									mime: 'application/vnd.oasis.opendocument.spreadsheet',
								};
							case 'application/vnd.oasis.opendocument.presentation':
								return {
									ext: 'odp',
									mime: 'application/vnd.oasis.opendocument.presentation',
								};
							default:
						}
					}

					// Try to find next header manually when current one is corrupted
					if (zipHeader.compressedSize === 0) {
						let nextHeaderIndex = -1;

						while (nextHeaderIndex < 0 && (tokenizer.position < tokenizer.fileInfo.size)) {
							await tokenizer.peekBuffer(this.buffer, {mayBeLess: true});

							nextHeaderIndex = this.buffer.indexOf('504B0304', 0, 'hex');
							// Move position to the next header if found, skip the whole buffer otherwise
							await tokenizer.ignore(nextHeaderIndex >= 0 ? nextHeaderIndex : this.buffer.length);
						}
					} else {
						await tokenizer.ignore(zipHeader.compressedSize);
					}
				}
			} catch (error) {
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		if (this.checkString('OggS')) {
			// This is an OGG container
			await tokenizer.ignore(28);
			const type = node_buffer.Buffer.alloc(8);
			await tokenizer.readBuffer(type);

			// Needs to be before `ogg` check
			if (_check(type, [0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64])) {
				return {
					ext: 'opus',
					mime: 'audio/opus',
				};
			}

			// If ' theora' in header.
			if (_check(type, [0x80, 0x74, 0x68, 0x65, 0x6F, 0x72, 0x61])) {
				return {
					ext: 'ogv',
					mime: 'video/ogg',
				};
			}

			// If '\x01video' in header.
			if (_check(type, [0x01, 0x76, 0x69, 0x64, 0x65, 0x6F, 0x00])) {
				return {
					ext: 'ogm',
					mime: 'video/ogg',
				};
			}

			// If ' FLAC' in header  https://xiph.org/flac/faq.html
			if (_check(type, [0x7F, 0x46, 0x4C, 0x41, 0x43])) {
				return {
					ext: 'oga',
					mime: 'audio/ogg',
				};
			}

			// 'Speex  ' in header https://en.wikipedia.org/wiki/Speex
			if (_check(type, [0x53, 0x70, 0x65, 0x65, 0x78, 0x20, 0x20])) {
				return {
					ext: 'spx',
					mime: 'audio/ogg',
				};
			}

			// If '\x01vorbis' in header
			if (_check(type, [0x01, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73])) {
				return {
					ext: 'ogg',
					mime: 'audio/ogg',
				};
			}

			// Default OGG container https://www.iana.org/assignments/media-types/application/ogg
			return {
				ext: 'ogx',
				mime: 'application/ogg',
			};
		}

		if (
			this.check([0x50, 0x4B])
			&& (this.buffer[2] === 0x3 || this.buffer[2] === 0x5 || this.buffer[2] === 0x7)
			&& (this.buffer[3] === 0x4 || this.buffer[3] === 0x6 || this.buffer[3] === 0x8)
		) {
			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		//

		// File Type Box (https://en.wikipedia.org/wiki/ISO_base_media_file_format)
		// It's not required to be first, but it's recommended to be. Almost all ISO base media files start with `ftyp` box.
		// `ftyp` box must contain a brand major identifier, which must consist of ISO 8859-1 printable characters.
		// Here we check for 8859-1 printable characters (for simplicity, it's a mask which also catches one non-printable character).
		if (
			this.checkString('ftyp', {offset: 4})
			&& (this.buffer[8] & 0x60) !== 0x00 // Brand major, first character ASCII?
		) {
			// They all can have MIME `video/mp4` except `application/mp4` special-case which is hard to detect.
			// For some cases, we're specific, everything else falls to `video/mp4` with `mp4` extension.
			const brandMajor = this.buffer.toString('binary', 8, 12).replace('\0', ' ').trim();
			switch (brandMajor) {
				case 'avif':
				case 'avis':
					return {ext: 'avif', mime: 'image/avif'};
				case 'mif1':
					return {ext: 'heic', mime: 'image/heif'};
				case 'msf1':
					return {ext: 'heic', mime: 'image/heif-sequence'};
				case 'heic':
				case 'heix':
					return {ext: 'heic', mime: 'image/heic'};
				case 'hevc':
				case 'hevx':
					return {ext: 'heic', mime: 'image/heic-sequence'};
				case 'qt':
					return {ext: 'mov', mime: 'video/quicktime'};
				case 'M4V':
				case 'M4VH':
				case 'M4VP':
					return {ext: 'm4v', mime: 'video/x-m4v'};
				case 'M4P':
					return {ext: 'm4p', mime: 'video/mp4'};
				case 'M4B':
					return {ext: 'm4b', mime: 'audio/mp4'};
				case 'M4A':
					return {ext: 'm4a', mime: 'audio/x-m4a'};
				case 'F4V':
					return {ext: 'f4v', mime: 'video/mp4'};
				case 'F4P':
					return {ext: 'f4p', mime: 'video/mp4'};
				case 'F4A':
					return {ext: 'f4a', mime: 'audio/mp4'};
				case 'F4B':
					return {ext: 'f4b', mime: 'audio/mp4'};
				case 'crx':
					return {ext: 'cr3', mime: 'image/x-canon-cr3'};
				default:
					if (brandMajor.startsWith('3g')) {
						if (brandMajor.startsWith('3g2')) {
							return {ext: '3g2', mime: 'video/3gpp2'};
						}

						return {ext: '3gp', mime: 'video/3gpp'};
					}

					return {ext: 'mp4', mime: 'video/mp4'};
			}
		}

		if (this.checkString('MThd')) {
			return {
				ext: 'mid',
				mime: 'audio/midi',
			};
		}

		if (
			this.checkString('wOFF')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff',
				mime: 'font/woff',
			};
		}

		if (
			this.checkString('wOF2')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff2',
				mime: 'font/woff2',
			};
		}

		if (this.check([0xD4, 0xC3, 0xB2, 0xA1]) || this.check([0xA1, 0xB2, 0xC3, 0xD4])) {
			return {
				ext: 'pcap',
				mime: 'application/vnd.tcpdump.pcap',
			};
		}

		// Sony DSD Stream File (DSF)
		if (this.checkString('DSD ')) {
			return {
				ext: 'dsf',
				mime: 'audio/x-dsf', // Non-standard
			};
		}

		if (this.checkString('LZIP')) {
			return {
				ext: 'lz',
				mime: 'application/x-lzip',
			};
		}

		if (this.checkString('fLaC')) {
			return {
				ext: 'flac',
				mime: 'audio/x-flac',
			};
		}

		if (this.check([0x42, 0x50, 0x47, 0xFB])) {
			return {
				ext: 'bpg',
				mime: 'image/bpg',
			};
		}

		if (this.checkString('wvpk')) {
			return {
				ext: 'wv',
				mime: 'audio/wavpack',
			};
		}

		if (this.checkString('%PDF')) {
			try {
				await tokenizer.ignore(1350);
				const maxBufferSize = 10 * 1024 * 1024;
				const buffer = node_buffer.Buffer.alloc(Math.min(maxBufferSize, tokenizer.fileInfo.size));
				await tokenizer.readBuffer(buffer, {mayBeLess: true});

				// Check if this is an Adobe Illustrator file
				if (buffer.includes(node_buffer.Buffer.from('AIPrivateData'))) {
					return {
						ext: 'ai',
						mime: 'application/postscript',
					};
				}
			} catch (error) {
				// Swallow end of stream error if file is too small for the Adobe AI check
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			// Assume this is just a normal PDF
			return {
				ext: 'pdf',
				mime: 'application/pdf',
			};
		}

		if (this.check([0x00, 0x61, 0x73, 0x6D])) {
			return {
				ext: 'wasm',
				mime: 'application/wasm',
			};
		}

		// TIFF, little-endian type
		if (this.check([0x49, 0x49])) {
			const fileType = await this.readTiffHeader(false);
			if (fileType) {
				return fileType;
			}
		}

		// TIFF, big-endian type
		if (this.check([0x4D, 0x4D])) {
			const fileType = await this.readTiffHeader(true);
			if (fileType) {
				return fileType;
			}
		}

		if (this.checkString('MAC ')) {
			return {
				ext: 'ape',
				mime: 'audio/ape',
			};
		}

		// https://github.com/file/file/blob/master/magic/Magdir/matroska
		if (this.check([0x1A, 0x45, 0xDF, 0xA3])) { // Root element: EBML
			async function readField() {
				const msb = await tokenizer.peekNumber(UINT8);
				let mask = 0x80;
				let ic = 0; // 0 = A, 1 = B, 2 = C, 3
				// = D

				while ((msb & mask) === 0 && mask !== 0) {
					++ic;
					mask >>= 1;
				}

				const id = node_buffer.Buffer.alloc(ic + 1);
				await tokenizer.readBuffer(id);
				return id;
			}

			async function readElement() {
				const id = await readField();
				const lengthField = await readField();
				lengthField[0] ^= 0x80 >> (lengthField.length - 1);
				const nrLength = Math.min(6, lengthField.length); // JavaScript can max read 6 bytes integer
				return {
					id: id.readUIntBE(0, id.length),
					len: lengthField.readUIntBE(lengthField.length - nrLength, nrLength),
				};
			}

			async function readChildren(children) {
				while (children > 0) {
					const element = await readElement();
					if (element.id === 0x42_82) {
						const rawValue = await tokenizer.readToken(new StringType(element.len, 'utf-8'));
						return rawValue.replace(/\00.*$/g, ''); // Return DocType
					}

					await tokenizer.ignore(element.len); // ignore payload
					--children;
				}
			}

			const re = await readElement();
			const docType = await readChildren(re.len);

			switch (docType) {
				case 'webm':
					return {
						ext: 'webm',
						mime: 'video/webm',
					};

				case 'matroska':
					return {
						ext: 'mkv',
						mime: 'video/x-matroska',
					};

				default:
					return;
			}
		}

		// RIFF file format which might be AVI, WAV, QCP, etc
		if (this.check([0x52, 0x49, 0x46, 0x46])) {
			if (this.check([0x41, 0x56, 0x49], {offset: 8})) {
				return {
					ext: 'avi',
					mime: 'video/vnd.avi',
				};
			}

			if (this.check([0x57, 0x41, 0x56, 0x45], {offset: 8})) {
				return {
					ext: 'wav',
					mime: 'audio/vnd.wave',
				};
			}

			// QLCM, QCP file
			if (this.check([0x51, 0x4C, 0x43, 0x4D], {offset: 8})) {
				return {
					ext: 'qcp',
					mime: 'audio/qcelp',
				};
			}
		}

		if (this.checkString('SQLi')) {
			return {
				ext: 'sqlite',
				mime: 'application/x-sqlite3',
			};
		}

		if (this.check([0x4E, 0x45, 0x53, 0x1A])) {
			return {
				ext: 'nes',
				mime: 'application/x-nintendo-nes-rom',
			};
		}

		if (this.checkString('Cr24')) {
			return {
				ext: 'crx',
				mime: 'application/x-google-chrome-extension',
			};
		}

		if (
			this.checkString('MSCF')
			|| this.checkString('ISc(')
		) {
			return {
				ext: 'cab',
				mime: 'application/vnd.ms-cab-compressed',
			};
		}

		if (this.check([0xED, 0xAB, 0xEE, 0xDB])) {
			return {
				ext: 'rpm',
				mime: 'application/x-rpm',
			};
		}

		if (this.check([0xC5, 0xD0, 0xD3, 0xC6])) {
			return {
				ext: 'eps',
				mime: 'application/eps',
			};
		}

		if (this.check([0x28, 0xB5, 0x2F, 0xFD])) {
			return {
				ext: 'zst',
				mime: 'application/zstd',
			};
		}

		if (this.check([0x7F, 0x45, 0x4C, 0x46])) {
			return {
				ext: 'elf',
				mime: 'application/x-elf',
			};
		}

		if (this.check([0x21, 0x42, 0x44, 0x4E])) {
			return {
				ext: 'pst',
				mime: 'application/vnd.ms-outlook',
			};
		}

		if (this.checkString('PAR1')) {
			return {
				ext: 'parquet',
				mime: 'application/x-parquet',
			};
		}

		if (this.check([0xCF, 0xFA, 0xED, 0xFE])) {
			return {
				ext: 'macho',
				mime: 'application/x-mach-binary',
			};
		}

		// -- 5-byte signatures --

		if (this.check([0x4F, 0x54, 0x54, 0x4F, 0x00])) {
			return {
				ext: 'otf',
				mime: 'font/otf',
			};
		}

		if (this.checkString('#!AMR')) {
			return {
				ext: 'amr',
				mime: 'audio/amr',
			};
		}

		if (this.checkString('{\\rtf')) {
			return {
				ext: 'rtf',
				mime: 'application/rtf',
			};
		}

		if (this.check([0x46, 0x4C, 0x56, 0x01])) {
			return {
				ext: 'flv',
				mime: 'video/x-flv',
			};
		}

		if (this.checkString('IMPM')) {
			return {
				ext: 'it',
				mime: 'audio/x-it',
			};
		}

		if (
			this.checkString('-lh0-', {offset: 2})
			|| this.checkString('-lh1-', {offset: 2})
			|| this.checkString('-lh2-', {offset: 2})
			|| this.checkString('-lh3-', {offset: 2})
			|| this.checkString('-lh4-', {offset: 2})
			|| this.checkString('-lh5-', {offset: 2})
			|| this.checkString('-lh6-', {offset: 2})
			|| this.checkString('-lh7-', {offset: 2})
			|| this.checkString('-lzs-', {offset: 2})
			|| this.checkString('-lz4-', {offset: 2})
			|| this.checkString('-lz5-', {offset: 2})
			|| this.checkString('-lhd-', {offset: 2})
		) {
			return {
				ext: 'lzh',
				mime: 'application/x-lzh-compressed',
			};
		}

		// MPEG program stream (PS or MPEG-PS)
		if (this.check([0x00, 0x00, 0x01, 0xBA])) {
			//  MPEG-PS, MPEG-1 Part 1
			if (this.check([0x21], {offset: 4, mask: [0xF1]})) {
				return {
					ext: 'mpg', // May also be .ps, .mpeg
					mime: 'video/MP1S',
				};
			}

			// MPEG-PS, MPEG-2 Part 1
			if (this.check([0x44], {offset: 4, mask: [0xC4]})) {
				return {
					ext: 'mpg', // May also be .mpg, .m2p, .vob or .sub
					mime: 'video/MP2P',
				};
			}
		}

		if (this.checkString('ITSF')) {
			return {
				ext: 'chm',
				mime: 'application/vnd.ms-htmlhelp',
			};
		}

		if (this.check([0xCA, 0xFE, 0xBA, 0xBE])) {
			return {
				ext: 'class',
				mime: 'application/java-vm',
			};
		}

		// -- 6-byte signatures --

		if (this.check([0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00])) {
			return {
				ext: 'xz',
				mime: 'application/x-xz',
			};
		}

		if (this.checkString('<?xml ')) {
			return {
				ext: 'xml',
				mime: 'application/xml',
			};
		}

		if (this.check([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
			return {
				ext: '7z',
				mime: 'application/x-7z-compressed',
			};
		}

		if (
			this.check([0x52, 0x61, 0x72, 0x21, 0x1A, 0x7])
			&& (this.buffer[6] === 0x0 || this.buffer[6] === 0x1)
		) {
			return {
				ext: 'rar',
				mime: 'application/x-rar-compressed',
			};
		}

		if (this.checkString('solid ')) {
			return {
				ext: 'stl',
				mime: 'model/stl',
			};
		}

		if (this.checkString('AC')) {
			const version = this.buffer.toString('binary', 2, 6);
			if (version.match('^d*') && version >= 1000 && version <= 1050) {
				return {
					ext: 'dwg',
					mime: 'image/vnd.dwg',
				};
			}
		}

		if (this.checkString('070707')) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		// -- 7-byte signatures --

		if (this.checkString('BLENDER')) {
			return {
				ext: 'blend',
				mime: 'application/x-blender',
			};
		}

		if (this.checkString('!<arch>')) {
			await tokenizer.ignore(8);
			const string = await tokenizer.readToken(new StringType(13, 'ascii'));
			if (string === 'debian-binary') {
				return {
					ext: 'deb',
					mime: 'application/x-deb',
				};
			}

			return {
				ext: 'ar',
				mime: 'application/x-unix-archive',
			};
		}

		if (this.checkString('**ACE', {offset: 7})) {
			await tokenizer.peekBuffer(this.buffer, {length: 14, mayBeLess: true});
			if (this.checkString('**', {offset: 12})) {
				return {
					ext: 'ace',
					mime: 'application/x-ace-compressed',
				};
			}
		}

		// -- 8-byte signatures --

		if (this.check([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
			// APNG format (https://wiki.mozilla.org/APNG_Specification)
			// 1. Find the first IDAT (image data) chunk (49 44 41 54)
			// 2. Check if there is an "acTL" chunk before the IDAT one (61 63 54 4C)

			// Offset calculated as follows:
			// - 8 bytes: PNG signature
			// - 4 (length) + 4 (chunk type) + 13 (chunk data) + 4 (CRC): IHDR chunk

			await tokenizer.ignore(8); // ignore PNG signature

			async function readChunkHeader() {
				return {
					length: await tokenizer.readToken(INT32_BE),
					type: await tokenizer.readToken(new StringType(4, 'binary')),
				};
			}

			do {
				const chunk = await readChunkHeader();
				if (chunk.length < 0) {
					return; // Invalid chunk length
				}

				switch (chunk.type) {
					case 'IDAT':
						return {
							ext: 'png',
							mime: 'image/png',
						};
					case 'acTL':
						return {
							ext: 'apng',
							mime: 'image/apng',
						};
					default:
						await tokenizer.ignore(chunk.length + 4); // Ignore chunk-data + CRC
				}
			} while (tokenizer.position + 8 < tokenizer.fileInfo.size);

			return {
				ext: 'png',
				mime: 'image/png',
			};
		}

		if (this.check([0x41, 0x52, 0x52, 0x4F, 0x57, 0x31, 0x00, 0x00])) {
			return {
				ext: 'arrow',
				mime: 'application/x-apache-arrow',
			};
		}

		if (this.check([0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])) {
			return {
				ext: 'glb',
				mime: 'model/gltf-binary',
			};
		}

		// `mov` format variants
		if (
			this.check([0x66, 0x72, 0x65, 0x65], {offset: 4}) // `free`
			|| this.check([0x6D, 0x64, 0x61, 0x74], {offset: 4}) // `mdat` MJPEG
			|| this.check([0x6D, 0x6F, 0x6F, 0x76], {offset: 4}) // `moov`
			|| this.check([0x77, 0x69, 0x64, 0x65], {offset: 4}) // `wide`
		) {
			return {
				ext: 'mov',
				mime: 'video/quicktime',
			};
		}

		// -- 9-byte signatures --

		if (this.check([0x49, 0x49, 0x52, 0x4F, 0x08, 0x00, 0x00, 0x00, 0x18])) {
			return {
				ext: 'orf',
				mime: 'image/x-olympus-orf',
			};
		}

		if (this.checkString('gimp xcf ')) {
			return {
				ext: 'xcf',
				mime: 'image/x-xcf',
			};
		}

		// -- 12-byte signatures --

		if (this.check([0x49, 0x49, 0x55, 0x00, 0x18, 0x00, 0x00, 0x00, 0x88, 0xE7, 0x74, 0xD8])) {
			return {
				ext: 'rw2',
				mime: 'image/x-panasonic-rw2',
			};
		}

		// ASF_Header_Object first 80 bytes
		if (this.check([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9])) {
			async function readHeader() {
				const guid = node_buffer.Buffer.alloc(16);
				await tokenizer.readBuffer(guid);
				return {
					id: guid,
					size: Number(await tokenizer.readToken(UINT64_LE)),
				};
			}

			await tokenizer.ignore(30);
			// Search for header should be in first 1KB of file.
			while (tokenizer.position + 24 < tokenizer.fileInfo.size) {
				const header = await readHeader();
				let payload = header.size - 24;
				if (_check(header.id, [0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11, 0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])) {
					// Sync on Stream-Properties-Object (B7DC0791-A9B7-11CF-8EE6-00C00C205365)
					const typeId = node_buffer.Buffer.alloc(16);
					payload -= await tokenizer.readBuffer(typeId);

					if (_check(typeId, [0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found audio:
						return {
							ext: 'asf',
							mime: 'audio/x-ms-asf',
						};
					}

					if (_check(typeId, [0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found video:
						return {
							ext: 'asf',
							mime: 'video/x-ms-asf',
						};
					}

					break;
				}

				await tokenizer.ignore(payload);
			}

			// Default to ASF generic extension
			return {
				ext: 'asf',
				mime: 'application/vnd.ms-asf',
			};
		}

		if (this.check([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A])) {
			return {
				ext: 'ktx',
				mime: 'image/ktx',
			};
		}

		if ((this.check([0x7E, 0x10, 0x04]) || this.check([0x7E, 0x18, 0x04])) && this.check([0x30, 0x4D, 0x49, 0x45], {offset: 4})) {
			return {
				ext: 'mie',
				mime: 'application/x-mie',
			};
		}

		if (this.check([0x27, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], {offset: 2})) {
			return {
				ext: 'shp',
				mime: 'application/x-esri-shape',
			};
		}

		if (this.check([0xFF, 0x4F, 0xFF, 0x51])) {
			return {
				ext: 'j2c',
				mime: 'image/j2c',
			};
		}

		if (this.check([0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A])) {
			// JPEG-2000 family

			await tokenizer.ignore(20);
			const type = await tokenizer.readToken(new StringType(4, 'ascii'));
			switch (type) {
				case 'jp2 ':
					return {
						ext: 'jp2',
						mime: 'image/jp2',
					};
				case 'jpx ':
					return {
						ext: 'jpx',
						mime: 'image/jpx',
					};
				case 'jpm ':
					return {
						ext: 'jpm',
						mime: 'image/jpm',
					};
				case 'mjp2':
					return {
						ext: 'mj2',
						mime: 'image/mj2',
					};
				default:
					return;
			}
		}

		if (
			this.check([0xFF, 0x0A])
			|| this.check([0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A])
		) {
			return {
				ext: 'jxl',
				mime: 'image/jxl',
			};
		}

		if (this.check([0xFE, 0xFF])) { // UTF-16-BOM-LE
			if (this.check([0, 60, 0, 63, 0, 120, 0, 109, 0, 108], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			return undefined; // Some unknown text based format
		}

		// -- Unsafe signatures --

		if (
			this.check([0x0, 0x0, 0x1, 0xBA])
			|| this.check([0x0, 0x0, 0x1, 0xB3])
		) {
			return {
				ext: 'mpg',
				mime: 'video/mpeg',
			};
		}

		if (this.check([0x00, 0x01, 0x00, 0x00, 0x00])) {
			return {
				ext: 'ttf',
				mime: 'font/ttf',
			};
		}

		if (this.check([0x00, 0x00, 0x01, 0x00])) {
			return {
				ext: 'ico',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0x00, 0x00, 0x02, 0x00])) {
			return {
				ext: 'cur',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) {
			// Detected Microsoft Compound File Binary File (MS-CFB) Format.
			return {
				ext: 'cfb',
				mime: 'application/x-cfb',
			};
		}

		// Increase sample size from 12 to 256.
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(256, tokenizer.fileInfo.size), mayBeLess: true});

		if (this.check([0x61, 0x63, 0x73, 0x70], {offset: 36})) {
			return {
				ext: 'icc',
				mime: 'application/vnd.iccprofile',
			};
		}

		// -- 15-byte signatures --

		if (this.checkString('BEGIN:')) {
			if (this.checkString('VCARD', {offset: 6})) {
				return {
					ext: 'vcf',
					mime: 'text/vcard',
				};
			}

			if (this.checkString('VCALENDAR', {offset: 6})) {
				return {
					ext: 'ics',
					mime: 'text/calendar',
				};
			}
		}

		// `raf` is here just to keep all the raw image detectors together.
		if (this.checkString('FUJIFILMCCD-RAW')) {
			return {
				ext: 'raf',
				mime: 'image/x-fujifilm-raf',
			};
		}

		if (this.checkString('Extended Module:')) {
			return {
				ext: 'xm',
				mime: 'audio/x-xm',
			};
		}

		if (this.checkString('Creative Voice File')) {
			return {
				ext: 'voc',
				mime: 'audio/x-voc',
			};
		}

		if (this.check([0x04, 0x00, 0x00, 0x00]) && this.buffer.length >= 16) { // Rough & quick check Pickle/ASAR
			const jsonSize = this.buffer.readUInt32LE(12);
			if (jsonSize > 12 && this.buffer.length >= jsonSize + 16) {
				try {
					const header = this.buffer.slice(16, jsonSize + 16).toString();
					const json = JSON.parse(header);
					// Check if Pickle is ASAR
					if (json.files) { // Final check, assuring Pickle/ASAR format
						return {
							ext: 'asar',
							mime: 'application/x-asar',
						};
					}
				} catch {}
			}
		}

		if (this.check([0x06, 0x0E, 0x2B, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0D, 0x01, 0x02, 0x01, 0x01, 0x02])) {
			return {
				ext: 'mxf',
				mime: 'application/mxf',
			};
		}

		if (this.checkString('SCRM', {offset: 44})) {
			return {
				ext: 's3m',
				mime: 'audio/x-s3m',
			};
		}

		// Raw MPEG-2 transport stream (188-byte packets)
		if (this.check([0x47]) && this.check([0x47], {offset: 188})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		// Blu-ray Disc Audio-Video (BDAV) MPEG-2 transport stream has 4-byte TP_extra_header before each 188-byte packet
		if (this.check([0x47], {offset: 4}) && this.check([0x47], {offset: 196})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		if (this.check([0x42, 0x4F, 0x4F, 0x4B, 0x4D, 0x4F, 0x42, 0x49], {offset: 60})) {
			return {
				ext: 'mobi',
				mime: 'application/x-mobipocket-ebook',
			};
		}

		if (this.check([0x44, 0x49, 0x43, 0x4D], {offset: 128})) {
			return {
				ext: 'dcm',
				mime: 'application/dicom',
			};
		}

		if (this.check([0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46])) {
			return {
				ext: 'lnk',
				mime: 'application/x.ms.shortcut', // Invented by us
			};
		}

		if (this.check([0x62, 0x6F, 0x6F, 0x6B, 0x00, 0x00, 0x00, 0x00, 0x6D, 0x61, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x00])) {
			return {
				ext: 'alias',
				mime: 'application/x.apple.alias', // Invented by us
			};
		}

		if (this.checkString('Kaydara FBX Binary  \u0000')) {
			return {
				ext: 'fbx',
				mime: 'application/x.autodesk.fbx', // Invented by us
			};
		}

		if (
			this.check([0x4C, 0x50], {offset: 34})
			&& (
				this.check([0x00, 0x00, 0x01], {offset: 8})
				|| this.check([0x01, 0x00, 0x02], {offset: 8})
				|| this.check([0x02, 0x00, 0x02], {offset: 8})
			)
		) {
			return {
				ext: 'eot',
				mime: 'application/vnd.ms-fontobject',
			};
		}

		if (this.check([0x06, 0x06, 0xED, 0xF5, 0xD8, 0x1D, 0x46, 0xE5, 0xBD, 0x31, 0xEF, 0xE7, 0xFE, 0x74, 0xB7, 0x1D])) {
			return {
				ext: 'indd',
				mime: 'application/x-indesign',
			};
		}

		// Increase sample size from 256 to 512
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(512, tokenizer.fileInfo.size), mayBeLess: true});

		// Requires a buffer size of 512 bytes
		if (tarHeaderChecksumMatches(this.buffer)) {
			return {
				ext: 'tar',
				mime: 'application/x-tar',
			};
		}

		if (this.check([0xFF, 0xFE])) { // UTF-16-BOM-BE
			if (this.check([60, 0, 63, 0, 120, 0, 109, 0, 108, 0], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			if (this.check([0xFF, 0x0E, 0x53, 0x00, 0x6B, 0x00, 0x65, 0x00, 0x74, 0x00, 0x63, 0x00, 0x68, 0x00, 0x55, 0x00, 0x70, 0x00, 0x20, 0x00, 0x4D, 0x00, 0x6F, 0x00, 0x64, 0x00, 0x65, 0x00, 0x6C, 0x00], {offset: 2})) {
				return {
					ext: 'skp',
					mime: 'application/vnd.sketchup.skp',
				};
			}

			return undefined; // Some text based format
		}

		if (this.checkString('-----BEGIN PGP MESSAGE-----')) {
			return {
				ext: 'pgp',
				mime: 'application/pgp-encrypted',
			};
		}

		// Check MPEG 1 or 2 Layer 3 header, or 'layer 0' for ADTS (MPEG sync-word 0xFFE)
		if (this.buffer.length >= 2 && this.check([0xFF, 0xE0], {offset: 0, mask: [0xFF, 0xE0]})) {
			if (this.check([0x10], {offset: 1, mask: [0x16]})) {
				// Check for (ADTS) MPEG-2
				if (this.check([0x08], {offset: 1, mask: [0x08]})) {
					return {
						ext: 'aac',
						mime: 'audio/aac',
					};
				}

				// Must be (ADTS) MPEG-4
				return {
					ext: 'aac',
					mime: 'audio/aac',
				};
			}

			// MPEG 1 or 2 Layer 3 header
			// Check for MPEG layer 3
			if (this.check([0x02], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 2
			if (this.check([0x04], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp2',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 1
			if (this.check([0x06], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp1',
					mime: 'audio/mpeg',
				};
			}
		}
	}

	async readTiffTag(bigEndian) {
		const tagId = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		this.tokenizer.ignore(10);
		switch (tagId) {
			case 50_341:
				return {
					ext: 'arw',
					mime: 'image/x-sony-arw',
				};
			case 50_706:
				return {
					ext: 'dng',
					mime: 'image/x-adobe-dng',
				};
		}
	}

	async readTiffIFD(bigEndian) {
		const numberOfTags = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		for (let n = 0; n < numberOfTags; ++n) {
			const fileType = await this.readTiffTag(bigEndian);
			if (fileType) {
				return fileType;
			}
		}
	}

	async readTiffHeader(bigEndian) {
		const version = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 2);
		const ifdOffset = (bigEndian ? UINT32_BE : UINT32_LE).get(this.buffer, 4);

		if (version === 42) {
			// TIFF file header
			if (ifdOffset >= 6) {
				if (this.checkString('CR', {offset: 8})) {
					return {
						ext: 'cr2',
						mime: 'image/x-canon-cr2',
					};
				}

				if (ifdOffset >= 8 && (this.check([0x1C, 0x00, 0xFE, 0x00], {offset: 8}) || this.check([0x1F, 0x00, 0x0B, 0x00], {offset: 8}))) {
					return {
						ext: 'nef',
						mime: 'image/x-nikon-nef',
					};
				}
			}

			await this.tokenizer.ignore(ifdOffset);
			const fileType = await this.readTiffIFD(bigEndian);
			return fileType ?? {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}

		if (version === 43) {	// Big TIFF file header
			return {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}
	}
}

new Set(extensions);
new Set(mimeTypes);

const imageExtensions = new Set([
	'jpg',
	'png',
	'gif',
	'webp',
	'flif',
	'cr2',
	'tif',
	'bmp',
	'jxr',
	'psd',
	'ico',
	'bpg',
	'jp2',
	'jpm',
	'jpx',
	'heic',
	'cur',
	'dcm',
	'avif',
]);

async function imageType(input) {
	const result = await fileTypeFromBuffer(input);
	return imageExtensions.has(result?.ext) && result;
}

// العربية
var ar = {};

// čeština
var cz = {};

// Dansk
var da = {};

// Deutsch
var de = {};

// English
var en = {
    // setting.ts
    "Plugin Settings": "Plugin Settings",
    "Auto pasted upload": "Auto pasted upload",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)",
    "Default uploader": "Default uploader",
    "PicGo server": "PicGo server upload route",
    "PicGo server desc": "upload route, use PicList will be able to set picbed and config through query",
    "Please input PicGo server": "Please input upload route",
    "PicGo delete server": "PicGo server delete route(you need to use PicList app)",
    "PicList desc": "Search PicList on Github to download and install",
    "Please input PicGo delete server": "Please input delete server",
    "Delete image using PicList": "Delete image using PicList",
    "PicGo-Core path": "PicGo-Core path",
    "Delete successfully": "Delete successfully",
    "Delete failed": "Delete failed",
    "Image size suffix": "Image size suffix",
    "Image size suffix Description": "like |300 for resize image in ob.",
    "Please input image size suffix": "Please input image size suffix",
    "Error, could not delete": "Error, could not delete",
    "Please input PicGo-Core path, default using environment variables": "Please input PicGo-Core path, default using environment variables",
    "Work on network": "Work on network",
    "Work on network Description": "Allow upload network image by 'Upload all' command.\n Or when you paste, md standard image link in your clipboard will be auto upload.",
    "Upload when clipboard has image and text together": "Upload when clipboard has image and text together",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "When you copy, some application like Excel will image and text to clipboard, you can upload or not.",
    "Network Domain Black List": "Network Domain Black List",
    "Network Domain Black List Description": "Image in the domain list will not be upload,use comma separated",
    "Delete source file after you upload file": "Delete source file after you upload file",
    "Delete source file in ob assets after you upload file.": "Delete source file in ob assets after you upload file.",
    "Image desc": "Image desc",
    reserve: "default",
    "remove all": "none",
    "remove default": "remove image.png",
    "Remote server mode": "Remote server mode",
    "Remote server mode desc": "If you have deployed piclist-core or piclist on the server.",
    "Can not find image file": "Can not find image file",
    "File has been changedd, upload failure": "File has been changedd, upload failure",
    "File has been changedd, download failure": "File has been changedd, download failure",
    "Warning: upload files is different of reciver files from api": "Warning: upload files num is different of reciver files from api",
    upload: "Upload",
};

// British English
var enGB = {};

// Español
var es = {};

// français
var fr = {};

// हिन्दी
var hi = {};

// Bahasa Indonesia
var id = {};

// Italiano
var it = {};

// 日本語
var ja = {};

// 한국어
var ko = {};

// Nederlands
var nl = {};

// Norsk
var no = {};

// język polski
var pl = {};

// Português
var pt = {};

// Português do Brasil
// Brazilian Portuguese
var ptBR = {};

// Română
var ro = {};

// русский
var ru = {};

// Türkçe
var tr = {};

// 简体中文
var zhCN = {
    // setting.ts
    "Plugin Settings": "插件设置",
    "Auto pasted upload": "剪切板自动上传",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "启用该选项后，黏贴图片时会自动上传（你需要正确配置picgo）",
    "Default uploader": "默认上传器",
    "PicGo server": "PicGo server 上传接口",
    "PicGo server desc": "上传接口，使用PicList时可通过设置URL参数指定图床和配置",
    "Please input PicGo server": "请输入上传接口地址",
    "PicGo delete server": "PicGo server 删除接口(请使用PicList来启用此功能)",
    "PicList desc": "PicList是PicGo二次开发版，请Github搜索PicList下载",
    "Please input PicGo delete server": "请输入删除接口地址",
    "Delete image using PicList": "使用 PicList 删除图片",
    "PicGo-Core path": "PicGo-Core 路径",
    "Delete successfully": "删除成功",
    "Delete failed": "删除失败",
    "Error, could not delete": "错误，无法删除",
    "Image size suffix": "图片大小后缀",
    "Image size suffix Description": "比如：|300 用于调整图片大小",
    "Please input image size suffix": "请输入图片大小后缀",
    "Please input PicGo-Core path, default using environment variables": "请输入 PicGo-Core path，默认使用环境变量",
    "Work on network": "应用网络图片",
    "Work on network Description": "当你上传所有图片时，也会上传网络图片。以及当你进行黏贴时，剪切板中的标准 md 图片会被上传",
    "Upload when clipboard has image and text together": "当剪切板同时拥有文本和图片剪切板数据时是否上传图片",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "当你复制时，某些应用例如 Excel 会在剪切板同时文本和图像数据，确认是否上传。",
    "Network Domain Black List": "网络图片域名黑名单",
    "Network Domain Black List Description": "黑名单域名中的图片将不会被上传，用英文逗号分割",
    "Delete source file after you upload file": "上传文件后移除源文件",
    "Delete source file in ob assets after you upload file.": "上传文件后移除在ob附件文件夹中的文件",
    "Image desc": "图片描述",
    reserve: "默认",
    "remove all": "无",
    "remove default": "移除image.png",
    "Remote server mode": "远程服务器模式",
    "Remote server mode desc": "如果你在服务器部署了piclist-core或者piclist",
    "Can not find image file": "没有解析到图像文件",
    "File has been changedd, upload failure": "当前文件已变更，上传失败",
    "File has been changedd, download failure": "当前文件已变更，下载失败",
    "Warning: upload files is different of reciver files from api": "警告：上传的文件与接口返回的文件数量不一致",
    upload: "上传",
};

// 繁體中文
var zhTW = {};

const localeMap = {
    ar,
    cs: cz,
    da,
    de,
    en,
    'en-gb': enGB,
    es,
    fr,
    hi,
    id,
    it,
    ja,
    ko,
    nl,
    nn: no,
    pl,
    pt,
    'pt-br': ptBR,
    ro,
    ru,
    tr,
    'zh-cn': zhCN,
    'zh-tw': zhTW,
};
const locale = localeMap[obsidian.moment.locale()];
function t(str) {
    return (locale && locale[str]) || en[str];
}

async function downloadAllImageFiles(plugin) {
    const activeFile = plugin.app.workspace.getActiveFile();
    const folderPath = await plugin.app.fileManager.getAvailablePathForAttachment("");
    const fileArray = plugin.helper.getAllFiles();
    if (!(await plugin.app.vault.adapter.exists(folderPath))) {
        await plugin.app.vault.adapter.mkdir(folderPath);
    }
    let imageArray = [];
    for (const file of fileArray) {
        if (!file.path.startsWith("http")) {
            continue;
        }
        const url = file.path;
        const asset = getUrlAsset(url);
        let name = decodeURI(pathBrowserifyExports.parse(asset).name).replaceAll(/[\\\\/:*?\"<>|]/g, "-");
        const response = await download(plugin, url, folderPath, name);
        if (response.ok) {
            const activeFolder = plugin.app.workspace.getActiveFile().parent.path;
            imageArray.push({
                source: file.source,
                name: name,
                path: obsidian.normalizePath(pathBrowserifyExports.relative(obsidian.normalizePath(activeFolder), obsidian.normalizePath(response.path))),
            });
        }
    }
    let value = plugin.helper.getValue();
    imageArray.map(image => {
        let name = plugin.handleName(image.name);
        value = value.replace(image.source, `![${name}](${encodeURI(image.path)})`);
    });
    const currentFile = plugin.app.workspace.getActiveFile();
    if (activeFile.path !== currentFile.path) {
        new obsidian.Notice(t("File has been changedd, download failure"));
        return;
    }
    plugin.helper.setValue(value);
    new obsidian.Notice(`all: ${fileArray.length}\nsuccess: ${imageArray.length}\nfailed: ${fileArray.length - imageArray.length}`);
}
async function download(plugin, url, folderPath, name) {
    const response = await obsidian.requestUrl({ url });
    if (response.status !== 200) {
        return {
            ok: false,
            msg: "error",
        };
    }
    const type = await imageType(new Uint8Array(response.arrayBuffer));
    if (!type) {
        return {
            ok: false,
            msg: "error",
        };
    }
    try {
        let path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${name}.${type.ext}`));
        // 如果文件名已存在，则用随机值替换，不对文件后缀进行判断
        if (await plugin.app.vault.adapter.exists(path)) {
            path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${uuid()}.${type.ext}`));
        }
        plugin.app.vault.adapter.writeBinary(path, response.arrayBuffer);
        return {
            ok: true,
            msg: "ok",
            path: path,
            type,
        };
    }
    catch (err) {
        return {
            ok: false,
            msg: err,
        };
    }
}

const randomString = (length) => Array(length + 1)
    .join((Math.random().toString(36) + "00000000000000000").slice(2, 18))
    .slice(0, length);
async function payloadGenerator(payload_data) {
    const boundary_string = `Boundary${randomString(16)}`;
    const boundary = `------${boundary_string}`;
    const chunks = [];
    for (const [key, values] of Object.entries(payload_data)) {
        for (const value of Array.isArray(values) ? values : [values]) {
            chunks.push(new TextEncoder().encode(`${boundary}\r\n`));
            if (typeof value === "string") {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
            }
            else if (value instanceof File) {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"; filename="${value.name}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`));
                chunks.push(new Uint8Array(await obsidian.getBlobArrayBuffer(value)));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
            else if (value instanceof Blob) {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"; filename="blob"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`));
                chunks.push(new Uint8Array(await value.arrayBuffer()));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
            else {
                chunks.push(new Uint8Array(await new Response(value).arrayBuffer()));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
        }
    }
    chunks.push(new TextEncoder().encode(`${boundary}--\r\n`));
    const payload = new Blob(chunks, {
        type: "multipart/form-data; boundary=" + boundary_string,
    });
    return [await payload.arrayBuffer(), boundary_string];
}

class PicGoUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        let response;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                if (typeof fileList[i] === "string") {
                    const { readFile } = require("fs");
                    const file = fileList[i];
                    const buffer = await new Promise((resolve, reject) => {
                        readFile(file, (err, data) => {
                            if (err) {
                                reject(err);
                            }
                            resolve(data);
                        });
                    });
                    const arrayBuffer = bufferToArrayBuffer(buffer);
                    files.push(new File([arrayBuffer], file));
                }
                else {
                    const timestamp = new Date().getTime();
                    const image = fileList[i];
                    if (!image.file)
                        continue;
                    const arrayBuffer = await this.plugin.app.vault.adapter.readBinary(image.file.path);
                    files.push(new File([arrayBuffer], timestamp + pathBrowserifyExports.extname(image.file.path)));
                }
            }
            response = await this.uploadFileByData(files);
        }
        else {
            const basePath = this.plugin.app.vault.adapter.getBasePath();
            const list = fileList.map(item => {
                if (typeof item === "string") {
                    return item;
                }
                else {
                    return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
                }
            });
            response = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ list: list }),
            });
        }
        return this.handleResponse(response);
    }
    async uploadFileByData(fileList) {
        const payload_data = {
            list: [],
        };
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            payload_data["list"].push(file);
        }
        const [request_body, boundary_string] = await payloadGenerator(payload_data);
        const options = {
            method: "POST",
            url: this.settings.uploadServer,
            contentType: `multipart/form-data; boundary=----${boundary_string}`,
            body: request_body,
        };
        const response = await obsidian.requestUrl(options);
        return response;
    }
    async uploadFileByClipboard(fileList) {
        let res;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                const timestamp = new Date().getTime();
                const file = fileList[i];
                const arrayBuffer = await file.arrayBuffer();
                files.push(new File([arrayBuffer], timestamp + ".png"));
            }
            res = await this.uploadFileByData(files);
        }
        else {
            res = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
            });
        }
        return this.handleResponse(res);
    }
    /**
     * 处理返回值
     */
    async handleResponse(response) {
        const data = (await response.json);
        if (response.status !== 200) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        if (data.success === false) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        // piclist
        if (data.fullResult) {
            const uploadUrlFullResultList = data.fullResult || [];
            this.settings.uploadedImages = [
                ...(this.settings.uploadedImages || []),
                ...uploadUrlFullResultList,
            ];
            this.plugin.saveSettings();
        }
        return {
            success: true,
            msg: "success",
            result: typeof data.result == "string" ? [data.result] : data.result,
        };
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        return this.uploadFileByClipboard(fileList);
    }
}

class PicGoCoreUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        const basePath = this.plugin.app.vault.adapter.getBasePath();
        const list = fileList.map(item => {
            if (typeof item === "string") {
                return item;
            }
            else {
                return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
            }
        });
        const length = list.length;
        let cli = this.settings.picgoCorePath || "picgo";
        let command = `${cli} upload ${list.map(item => `"${item}"`).join(" ")}`;
        const res = await this.exec(command);
        const splitList = res.split("\n");
        const splitListLength = splitList.length;
        const data = splitList.splice(splitListLength - 1 - length, length);
        if (res.includes("PicGo ERROR")) {
            console.log(command, res);
            return {
                success: false,
                msg: "失败",
                result: [],
            };
        }
        else {
            return {
                success: true,
                result: data,
            };
        }
    }
    // PicGo-Core 上传处理
    async uploadFileByClipboard() {
        const res = await this.uploadByClip();
        const splitList = res.split("\n");
        const lastImage = getLastImage(splitList);
        if (lastImage) {
            return {
                success: true,
                msg: "success",
                result: [lastImage],
            };
        }
        else {
            console.log(splitList);
            return {
                success: false,
                msg: `"Please check PicGo-Core config"\n${res}`,
                result: [],
            };
        }
    }
    // PicGo-Core的剪切上传反馈
    async uploadByClip() {
        let command;
        if (this.settings.picgoCorePath) {
            command = `${this.settings.picgoCorePath} upload`;
        }
        else {
            command = `picgo upload`;
        }
        const res = await this.exec(command);
        return res;
    }
    async exec(command) {
        const { exec } = require("child_process");
        let { stdout } = await exec(command);
        const res = await streamToString(stdout);
        return res;
    }
    async spawnChild() {
        const { spawn } = require("child_process");
        const child = spawn("picgo", ["upload"], {
            shell: true,
        });
        let data = "";
        for await (const chunk of child.stdout) {
            data += chunk;
        }
        let error = "";
        for await (const chunk of child.stderr) {
            error += chunk;
        }
        const exitCode = await new Promise((resolve, reject) => {
            child.on("close", resolve);
        });
        if (exitCode) {
            throw new Error(`subprocess error exit ${exitCode}, ${error}`);
        }
        return data;
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        console.log("uploadByClipboard", fileList);
        return this.uploadFileByClipboard();
    }
}

function getUploader(uploader) {
    switch (uploader) {
        case "PicGo":
            return PicGoUploader;
        case "PicGo-Core":
            return PicGoCoreUploader;
        default:
            throw new Error("Invalid uploader");
    }
}
class UploaderManager {
    uploader;
    plugin;
    constructor(uploader, plugin) {
        this.plugin = plugin;
        const Uploader = getUploader(uploader);
        this.uploader = new Uploader(this.plugin);
    }
    async upload(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.upload(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
    async uploadByClipboard(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.uploadByClipboard(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
}

class PicGoDeleter {
    plugin;
    constructor(plugin) {
        this.plugin = plugin;
    }
    async deleteImage(configMap) {
        const response = await obsidian.requestUrl({
            url: this.plugin.settings.deleteServer,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                list: configMap,
            }),
        });
        const data = response.json;
        return data;
    }
}

// ![](./dsa/aa.png) local image should has ext, support ![](<./dsa/aa.png>), support ![](image.png "alt")
// ![](https://dasdasda) internet image should not has ext
const REGEX_FILE = /\!\[(.*?)\]\(<(\S+\.\w+)>\)|\!\[(.*?)\]\((\S+\.\w+)(?:\s+"[^"]*")?\)|\!\[(.*?)\]\((https?:\/\/.*?)\)/g;
const REGEX_WIKI_FILE = /\!\[\[(.*?)(\s*?\|.*?)?\]\]/g;
class Helper {
    app;
    constructor(app) {
        this.app = app;
    }
    getFrontmatterValue(key, defaultValue = undefined) {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return undefined;
        }
        const path = file.path;
        const cache = this.app.metadataCache.getCache(path);
        let value = defaultValue;
        if (cache?.frontmatter && cache.frontmatter.hasOwnProperty(key)) {
            value = cache.frontmatter[key];
        }
        return value;
    }
    getEditor() {
        const mdView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (mdView) {
            return mdView.editor;
        }
        else {
            return null;
        }
    }
    getValue() {
        const editor = this.getEditor();
        return editor.getValue();
    }
    setValue(value) {
        const editor = this.getEditor();
        const { left, top } = editor.getScrollInfo();
        const position = editor.getCursor();
        editor.setValue(value);
        editor.scrollTo(left, top);
        editor.setCursor(position);
    }
    // get all file urls, include local and internet
    getAllFiles() {
        const editor = this.getEditor();
        let value = editor.getValue();
        return this.getImageLink(value);
    }
    getImageLink(value) {
        const matches = value.matchAll(REGEX_FILE);
        const WikiMatches = value.matchAll(REGEX_WIKI_FILE);
        let fileArray = [];
        for (const match of matches) {
            const source = match[0];
            let name = match[1];
            let path = match[2];
            if (name === undefined) {
                name = match[3];
            }
            if (path === undefined) {
                path = match[4];
            }
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        for (const match of WikiMatches) {
            let name = pathBrowserifyExports.parse(match[1]).name;
            const path = match[1];
            const source = match[0];
            if (match[2]) {
                name = `${name}${match[2]}`;
            }
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        return fileArray;
    }
    hasBlackDomain(src, blackDomains) {
        if (blackDomains.trim() === "") {
            return false;
        }
        const blackDomainList = blackDomains.split(",").filter(item => item !== "");
        let url = new URL(src);
        const domain = url.hostname;
        return blackDomainList.some(blackDomain => domain.includes(blackDomain));
    }
}

const DEFAULT_SETTINGS = {
    uploadByClipSwitch: true,
    uploader: "PicGo",
    uploadServer: "http://127.0.0.1:36677/upload",
    deleteServer: "http://127.0.0.1:36677/delete",
    imageSizeSuffix: "",
    picgoCorePath: "",
    workOnNetWork: false,
    applyImage: true,
    newWorkBlackDomains: "",
    deleteSource: false,
    imageDesc: "origin",
    remoteServerMode: false,
    addPandocFig: false,
};
class SettingTab extends obsidian.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: t("Plugin Settings") });
        new obsidian.Setting(containerEl)
            .setName(t("Auto pasted upload"))
            .setDesc(t("If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.uploadByClipSwitch)
            .onChange(async (value) => {
            this.plugin.settings.uploadByClipSwitch = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Default uploader"))
            .setDesc(t("Default uploader"))
            .addDropdown(cb => cb
            .addOption("PicGo", "PicGo(app)")
            .addOption("PicGo-Core", "PicGo-Core")
            .setValue(this.plugin.settings.uploader)
            .onChange(async (value) => {
            this.plugin.settings.uploader = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo server"))
                .setDesc(t("PicGo server desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo server"))
                .setValue(this.plugin.settings.uploadServer)
                .onChange(async (key) => {
                this.plugin.settings.uploadServer = key;
                await this.plugin.saveSettings();
            }));
            new obsidian.Setting(containerEl)
                .setName(t("PicGo delete server"))
                .setDesc(t("PicList desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo delete server"))
                .setValue(this.plugin.settings.deleteServer)
                .onChange(async (key) => {
                this.plugin.settings.deleteServer = key;
                await this.plugin.saveSettings();
            }));
        }
        new obsidian.Setting(containerEl)
            .setName(t("Remote server mode"))
            .setDesc(t("Remote server mode desc"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.remoteServerMode)
            .onChange(async (value) => {
            this.plugin.settings.remoteServerMode = value;
            if (value) {
                this.plugin.settings.workOnNetWork = false;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo-Core") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo-Core path"))
                .setDesc(t("Please input PicGo-Core path, default using environment variables"))
                .addText(text => text
                .setPlaceholder("")
                .setValue(this.plugin.settings.picgoCorePath)
                .onChange(async (value) => {
                this.plugin.settings.picgoCorePath = value;
                await this.plugin.saveSettings();
            }));
        }
        // image desc setting
        new obsidian.Setting(containerEl)
            .setName(t("Image desc"))
            .setDesc(t("Image desc"))
            .addDropdown(cb => cb
            .addOption("origin", t("reserve")) // 保留全部
            .addOption("none", t("remove all")) // 移除全部
            .addOption("removeDefault", t("remove default")) // 只移除默认即 image.png
            .setValue(this.plugin.settings.imageDesc)
            .onChange(async (value) => {
            this.plugin.settings.imageDesc = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Image size suffix"))
            .setDesc(t("Image size suffix Description"))
            .addText(text => text
            .setPlaceholder(t("Please input image size suffix"))
            .setValue(this.plugin.settings.imageSizeSuffix)
            .onChange(async (key) => {
            this.plugin.settings.imageSizeSuffix = key;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Work on network"))
            .setDesc(t("Work on network Description"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.workOnNetWork)
            .onChange(async (value) => {
            if (this.plugin.settings.remoteServerMode) {
                new obsidian.Notice("Can only work when remote server mode is off.");
                this.plugin.settings.workOnNetWork = false;
            }
            else {
                this.plugin.settings.workOnNetWork = value;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Network Domain Black List"))
            .setDesc(t("Network Domain Black List Description"))
            .addTextArea(textArea => textArea
            .setValue(this.plugin.settings.newWorkBlackDomains)
            .onChange(async (value) => {
            this.plugin.settings.newWorkBlackDomains = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Upload when clipboard has image and text together"))
            .setDesc(t("When you copy, some application like Excel will image and text to clipboard, you can upload or not."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.applyImage)
            .onChange(async (value) => {
            this.plugin.settings.applyImage = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Delete source file after you upload file"))
            .setDesc(t("Delete source file in ob assets after you upload file."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.deleteSource)
            .onChange(async (value) => {
            this.plugin.settings.deleteSource = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('启用 Pandoc Fig 格式')
            .setDesc('开启后，上传图片将生成 ![Alt](Url){#fig:时间戳} 格式')
            .addToggle((toggle) => {
            toggle
                .setValue(this.plugin.settings.addPandocFig)
                .onChange(async (value) => {
                this.plugin.settings.addPandocFig = value;
                await this.plugin.saveSettings();
            });
        });
    }
}

class imageAutoUploadPlugin extends obsidian.Plugin {
    settings;
    helper;
    editor;
    picGoDeleter;
    async loadSettings() {
        this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    onunload() { }
    async onload() {
        await this.loadSettings();
        this.helper = new Helper(this.app);
        this.picGoDeleter = new PicGoDeleter(this);
        obsidian.addIcon("upload", `<svg t="1636630783429" class="icon" viewBox="0 0 100 100" version="1.1" p-id="4649" xmlns="http://www.w3.org/2000/svg">
      <path d="M 71.638 35.336 L 79.408 35.336 C 83.7 35.336 87.178 38.662 87.178 42.765 L 87.178 84.864 C 87.178 88.969 83.7 92.295 79.408 92.295 L 17.249 92.295 C 12.957 92.295 9.479 88.969 9.479 84.864 L 9.479 42.765 C 9.479 38.662 12.957 35.336 17.249 35.336 L 25.019 35.336 L 25.019 42.765 L 17.249 42.765 L 17.249 84.864 L 79.408 84.864 L 79.408 42.765 L 71.638 42.765 L 71.638 35.336 Z M 49.014 10.179 L 67.326 27.688 L 61.835 32.942 L 52.849 24.352 L 52.849 59.731 L 45.078 59.731 L 45.078 24.455 L 36.194 32.947 L 30.702 27.692 L 49.012 10.181 Z" p-id="4650" fill="#8a8a8a"></path>
    </svg>`);
        this.addSettingTab(new SettingTab(this.app, this));
        this.addCommand({
            id: "Upload all images",
            name: "Upload all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        this.uploadAllFile();
                    }
                    return true;
                }
                return false;
            },
        });
        this.addCommand({
            id: "Download all images",
            name: "Download all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        downloadAllImageFiles(this);
                    }
                    return true;
                }
                return false;
            },
        });
        this.setupPasteHandler();
        this.registerFileMenu();
        this.registerSelection();
    }
    /**
     * 获取当前使用的上传器
     */
    getUploader() {
        const uploader = new UploaderManager(this.settings.uploader, this);
        return uploader;
    }
    /**
     * 上传图片
     */
    upload(images) {
        let uploader = this.getUploader();
        return uploader.upload(images);
    }
    /**
     * 通过剪贴板上传图片
     */
    uploadByClipboard(fileList) {
        let uploader = this.getUploader();
        return uploader.uploadByClipboard(fileList);
    }
    registerSelection() {
        this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
            if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
                return;
            }
            const selection = editor.getSelection();
            if (selection) {
                const markdownRegex = /!\[.*\]\((.*)\)/g;
                const markdownMatch = markdownRegex.exec(selection);
                if (markdownMatch && markdownMatch.length > 1) {
                    const markdownUrl = markdownMatch[1];
                    if (this.settings.uploadedImages.find((item) => item.imgUrl === markdownUrl)) {
                        this.addRemoveMenu(menu, markdownUrl, editor);
                    }
                }
            }
        }));
    }
    addRemoveMenu = (menu, imgPath, editor) => {
        menu.addItem((item) => item
            .setIcon("trash-2")
            .setTitle(t("Delete image using PicList"))
            .onClick(async () => {
            try {
                const selectedItem = this.settings.uploadedImages.find((item) => item.imgUrl === imgPath);
                if (selectedItem) {
                    const res = await this.picGoDeleter.deleteImage([selectedItem]);
                    if (res.success) {
                        new obsidian.Notice(t("Delete successfully"));
                        const selection = editor.getSelection();
                        if (selection) {
                            editor.replaceSelection("");
                        }
                        this.settings.uploadedImages =
                            this.settings.uploadedImages.filter((item) => item.imgUrl !== imgPath);
                        this.saveSettings();
                    }
                    else {
                        new obsidian.Notice(t("Delete failed"));
                    }
                }
            }
            catch {
                new obsidian.Notice(t("Error, could not delete"));
            }
        }));
    };
    registerFileMenu() {
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source, leaf) => {
            if (source === "canvas-menu")
                return false;
            if (!isAssetTypeAnImage(file.path))
                return false;
            menu.addItem((item) => {
                item
                    .setTitle(t("upload"))
                    .setIcon("upload")
                    .onClick(() => {
                    if (!(file instanceof obsidian.TFile)) {
                        return false;
                    }
                    this.fileMenuUpload(file);
                });
            });
        }));
    }
    fileMenuUpload(file) {
        let imageList = [];
        const fileArray = this.helper.getAllFiles();
        for (const match of fileArray) {
            const imageName = match.name;
            const encodedUri = match.path;
            const fileName = pathBrowserifyExports.basename(decodeURI(encodedUri));
            if (file && file.name === fileName) {
                if (isAssetTypeAnImage(file.path)) {
                    imageList.push({
                        path: file.path,
                        name: imageName,
                        source: match.source,
                        file: file,
                    });
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        this.upload(imageList).then(res => {
            if (!res.success) {
                new obsidian.Notice("Upload error");
                return;
            }
            let uploadUrlList = res.result;
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    filterFile(fileArray) {
        const imageList = [];
        for (const match of fileArray) {
            if (match.path.startsWith("http")) {
                if (this.settings.workOnNetWork) {
                    if (!this.helper.hasBlackDomain(match.path, this.settings.newWorkBlackDomains)) {
                        imageList.push({
                            path: match.path,
                            name: match.name,
                            source: match.source,
                        });
                    }
                }
            }
            else {
                imageList.push({
                    path: match.path,
                    name: match.name,
                    source: match.source,
                });
            }
        }
        return imageList;
    }
    /**
     * 替换上传的图片
     */
    replaceImage(imageList, uploadUrlList) {
        let content = this.helper.getValue();
        // --- 【修改开始：增加 index 参数】 ---
        imageList.map((item, index) => {
            const uploadImage = uploadUrlList.shift();
            let name = this.handleName(item.name);
            let replacement = "";
            if (this.settings.addPandocFig) {
                // 批量上传时，为了防止时间戳完全重复，在后面加一个序号
                const timestamp = window.moment().format("YYYYMMDDHHmmss") + (index > 0 ? `-${index}` : "");
                replacement = `![${name}](${uploadImage}){#fig:${timestamp}}`;
            }
            else {
                replacement = `![${name}](${uploadImage})`;
            }
            // 注意：这里用 replacement 替换原来的图片链接
            content = content.replaceAll(item.source, replacement);
        });
        // --- 【修改结束】 ---
        this.helper.setValue(content);
        if (this.settings.deleteSource) {
            imageList.map(image => {
                if (image.file && !image.path.startsWith("http")) {
                    this.app.fileManager.trashFile(image.file);
                }
            });
        }
    }
    /**
     * 上传所有图片
     */
    uploadAllFile() {
        const activeFile = this.app.workspace.getActiveFile();
        const fileMap = arrayToObject(this.app.vault.getFiles(), "name");
        const filePathMap = arrayToObject(this.app.vault.getFiles(), "path");
        let imageList = [];
        const fileArray = this.filterFile(this.helper.getAllFiles());
        for (const match of fileArray) {
            const imageName = match.name;
            const uri = decodeURI(match.path);
            if (uri.startsWith("http")) {
                imageList.push({
                    path: match.path,
                    name: imageName,
                    source: match.source,
                    file: null,
                });
            }
            else {
                const fileName = pathBrowserifyExports.basename(uri);
                let file;
                // 优先匹配绝对路径
                if (filePathMap[uri]) {
                    file = filePathMap[uri];
                }
                // 相对路径
                if ((!file && uri.startsWith("./")) || uri.startsWith("../")) {
                    const filePath = obsidian.normalizePath(pathBrowserifyExports.resolve(pathBrowserifyExports.dirname(activeFile.path), uri));
                    file = filePathMap[filePath];
                }
                // 尽可能短路径
                if (!file) {
                    file = fileMap[fileName];
                }
                if (file) {
                    if (isAssetTypeAnImage(file.path)) {
                        imageList.push({
                            path: obsidian.normalizePath(file.path),
                            name: imageName,
                            source: match.source,
                            file: file,
                        });
                    }
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        else {
            new obsidian.Notice(`Have found ${imageList.length} images`);
        }
        this.upload(imageList).then(res => {
            let uploadUrlList = res.result;
            if (imageList.length !== uploadUrlList.length) {
                new obsidian.Notice(t("Warning: upload files is different of reciver files from api"));
                return;
            }
            const currentFile = this.app.workspace.getActiveFile();
            if (activeFile.path !== currentFile.path) {
                new obsidian.Notice(t("File has been changedd, upload failure"));
                return;
            }
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    setupPasteHandler() {
        this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, markdownView) => {
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload", this.settings.uploadByClipSwitch);
            evt.clipboardData.files;
            if (!allowUpload) {
                return;
            }
            // 剪贴板内容有md格式的图片时
            if (this.settings.workOnNetWork) {
                const clipboardValue = evt.clipboardData.getData("text/plain");
                const imageList = this.helper
                    .getImageLink(clipboardValue)
                    .filter(image => image.path.startsWith("http"))
                    .filter(image => !this.helper.hasBlackDomain(image.path, this.settings.newWorkBlackDomains));
                if (imageList.length !== 0) {
                    this.upload(imageList).then(res => {
                        let uploadUrlList = res.result;
                        this.replaceImage(imageList, uploadUrlList);
                    });
                }
            }
            // 剪贴板中是图片时进行上传
            if (this.canUpload(evt.clipboardData)) {
                this.uploadFileAndEmbedImgurImage(editor, async (editor, pasteId) => {
                    let res;
                    res = await this.uploadByClipboard(evt.clipboardData.files);
                    if (res.code !== 0) {
                        this.handleFailedUpload(editor, pasteId, res.msg);
                        return;
                    }
                    const url = res.data;
                    return url;
                }, evt.clipboardData).catch();
                evt.preventDefault();
            }
        }));
        this.registerEvent(this.app.workspace.on("editor-drop", async (evt, editor, markdownView) => {
            // when ctrl key is pressed, do not upload image, because it is used to set local file
            if (evt.ctrlKey) {
                return;
            }
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload", this.settings.uploadByClipSwitch);
            if (!allowUpload) {
                return;
            }
            let files = evt.dataTransfer.files;
            if (files.length !== 0 && files[0].type.startsWith("image")) {
                let sendFiles = [];
                let files = evt.dataTransfer.files;
                Array.from(files).forEach((item, index) => {
                    if (item.path) {
                        sendFiles.push(item.path);
                    }
                    else {
                        const { webUtils } = require("electron");
                        const path = webUtils.getPathForFile(item);
                        sendFiles.push(path);
                    }
                });
                evt.preventDefault();
                const data = await this.upload(sendFiles);
                if (data.success) {
                    data.result.map((value) => {
                        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
                        this.insertTemporaryText(editor, pasteId);
                        this.embedMarkDownImage(editor, pasteId, value, files[0].name);
                    });
                }
                else {
                    new obsidian.Notice("Upload error");
                }
            }
        }));
    }
    canUpload(clipboardData) {
        this.settings.applyImage;
        const files = clipboardData.files;
        const text = clipboardData.getData("text");
        const hasImageFile = files.length !== 0 && files[0].type.startsWith("image");
        if (hasImageFile) {
            if (!!text) {
                return this.settings.applyImage;
            }
            else {
                return true;
            }
        }
        else {
            return false;
        }
    }
    async uploadFileAndEmbedImgurImage(editor, callback, clipboardData) {
        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
        this.insertTemporaryText(editor, pasteId);
        const name = clipboardData.files[0].name;
        try {
            const url = await callback(editor, pasteId);
            this.embedMarkDownImage(editor, pasteId, url, name);
        }
        catch (e) {
            this.handleFailedUpload(editor, pasteId, e);
        }
    }
    insertTemporaryText(editor, pasteId) {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        editor.replaceSelection(progressText + "\n");
    }
    static progressTextFor(id) {
        return `![Uploading file...${id}]()`;
    }
    embedMarkDownImage(editor, pasteId, imageUrl, name = "") {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        name = this.handleName(name);
        let markDownImage = "";
        if (this.settings.addPandocFig) {
            // 获取当前时间戳 (使用 window as any 规避 TypeScript 类型检查报错)
            const timestamp = window.moment().format("YYYYMMDDHHmmss");
            markDownImage = `![${name}](${imageUrl}){#fig:${timestamp}}`;
        }
        else {
            // 如果开关关闭，保持原样
            markDownImage = `![${name}](${imageUrl})`;
        }
        // --- 【修改结束】 ---
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, markDownImage);
    }
    handleFailedUpload(editor, pasteId, reason) {
        new obsidian.Notice(reason);
        console.error("Failed request: ", reason);
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, "⚠️upload failed, check dev console");
    }
    handleName(name) {
        const imageSizeSuffix = this.settings.imageSizeSuffix || "";
        if (this.settings.imageDesc === "origin") {
            return `${name}${imageSizeSuffix}`;
        }
        else if (this.settings.imageDesc === "none") {
            return "";
        }
        else if (this.settings.imageDesc === "removeDefault") {
            if (name === "image.png") {
                return "";
            }
            else {
                return `${name}${imageSizeSuffix}`;
            }
        }
        else {
            return `${name}${imageSizeSuffix}`;
        }
    }
    static replaceFirstOccurrence(editor, target, replacement) {
        let lines = editor.getValue().split("\n");
        for (let i = 0; i < lines.length; i++) {
            let ch = lines[i].indexOf(target);
            if (ch != -1) {
                let from = { line: i, ch: ch };
                let to = { line: i, ch: ch + target.length };
                editor.replaceRange(replacement, from, to);
                break;
            }
        }
    }
}

module.exports = imageAutoUploadPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzLy5wbnBtL3BhdGgtYnJvd3NlcmlmeUAxLjAuMS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwic3JjL3V0aWxzLnRzIiwibm9kZV9tb2R1bGVzLy5wbnBtL3Rva2VuLXR5cGVzQDUuMC4xL25vZGVfbW9kdWxlcy90b2tlbi10eXBlcy9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvLnBucG0vcGVlay1yZWFkYWJsZUA1LjMuMS9ub2RlX21vZHVsZXMvcGVlay1yZWFkYWJsZS9saWIvRW5kT2ZTdHJlYW1FcnJvci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9EZWZlcnJlZC5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9BYnN0cmFjdFN0cmVhbVJlYWRlci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9TdHJlYW1SZWFkZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvQWJzdHJhY3RUb2tlbml6ZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvUmVhZFN0cmVhbVRva2VuaXplci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9zdHJ0b2szQDcuMS4xL25vZGVfbW9kdWxlcy9zdHJ0b2szL2xpYi9CdWZmZXJUb2tlbml6ZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvY29yZS5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9maWxlLXR5cGVAMTguNy4wL25vZGVfbW9kdWxlcy9maWxlLXR5cGUvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9maWxlLXR5cGVAMTguNy4wL25vZGVfbW9kdWxlcy9maWxlLXR5cGUvc3VwcG9ydGVkLmpzIiwibm9kZV9tb2R1bGVzLy5wbnBtL2ZpbGUtdHlwZUAxOC43LjAvbm9kZV9tb2R1bGVzL2ZpbGUtdHlwZS9jb3JlLmpzIiwibm9kZV9tb2R1bGVzLy5wbnBtL2ltYWdlLXR5cGVANS4yLjAvbm9kZV9tb2R1bGVzL2ltYWdlLXR5cGUvaW5kZXguanMiLCJzcmMvbGFuZy9sb2NhbGUvYXIudHMiLCJzcmMvbGFuZy9sb2NhbGUvY3oudHMiLCJzcmMvbGFuZy9sb2NhbGUvZGEudHMiLCJzcmMvbGFuZy9sb2NhbGUvZGUudHMiLCJzcmMvbGFuZy9sb2NhbGUvZW4udHMiLCJzcmMvbGFuZy9sb2NhbGUvZW4tZ2IudHMiLCJzcmMvbGFuZy9sb2NhbGUvZXMudHMiLCJzcmMvbGFuZy9sb2NhbGUvZnIudHMiLCJzcmMvbGFuZy9sb2NhbGUvaGkudHMiLCJzcmMvbGFuZy9sb2NhbGUvaWQudHMiLCJzcmMvbGFuZy9sb2NhbGUvaXQudHMiLCJzcmMvbGFuZy9sb2NhbGUvamEudHMiLCJzcmMvbGFuZy9sb2NhbGUva28udHMiLCJzcmMvbGFuZy9sb2NhbGUvbmwudHMiLCJzcmMvbGFuZy9sb2NhbGUvbm8udHMiLCJzcmMvbGFuZy9sb2NhbGUvcGwudHMiLCJzcmMvbGFuZy9sb2NhbGUvcHQudHMiLCJzcmMvbGFuZy9sb2NhbGUvcHQtYnIudHMiLCJzcmMvbGFuZy9sb2NhbGUvcm8udHMiLCJzcmMvbGFuZy9sb2NhbGUvcnUudHMiLCJzcmMvbGFuZy9sb2NhbGUvdHIudHMiLCJzcmMvbGFuZy9sb2NhbGUvemgtY24udHMiLCJzcmMvbGFuZy9sb2NhbGUvemgtdHcudHMiLCJzcmMvbGFuZy9oZWxwZXJzLnRzIiwic3JjL2Rvd25sb2FkLnRzIiwic3JjL3BheWxvYWRHZW5lcmF0b3IudHMiLCJzcmMvdXBsb2FkZXIvcGljZ28udHMiLCJzcmMvdXBsb2FkZXIvcGljZ29Db3JlLnRzIiwic3JjL3VwbG9hZGVyL2luZGV4LnRzIiwic3JjL2RlbGV0ZXIudHMiLCJzcmMvaGVscGVyLnRzIiwic3JjL3NldHRpbmcudHMiLCJzcmMvbWFpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyAncGF0aCcgbW9kdWxlIGV4dHJhY3RlZCBmcm9tIE5vZGUuanMgdjguMTEuMSAob25seSB0aGUgcG9zaXggcGFydClcbi8vIHRyYW5zcGxpdGVkIHdpdGggQmFiZWxcblxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYXNzZXJ0UGF0aChwYXRoKSB7XG4gIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdQYXRoIG11c3QgYmUgYSBzdHJpbmcuIFJlY2VpdmVkICcgKyBKU09OLnN0cmluZ2lmeShwYXRoKSk7XG4gIH1cbn1cblxuLy8gUmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIHdpdGggZGlyZWN0b3J5IG5hbWVzXG5mdW5jdGlvbiBub3JtYWxpemVTdHJpbmdQb3NpeChwYXRoLCBhbGxvd0Fib3ZlUm9vdCkge1xuICB2YXIgcmVzID0gJyc7XG4gIHZhciBsYXN0U2VnbWVudExlbmd0aCA9IDA7XG4gIHZhciBsYXN0U2xhc2ggPSAtMTtcbiAgdmFyIGRvdHMgPSAwO1xuICB2YXIgY29kZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPD0gcGF0aC5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpIDwgcGF0aC5sZW5ndGgpXG4gICAgICBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KGkpO1xuICAgIGVsc2UgaWYgKGNvZGUgPT09IDQ3IC8qLyovKVxuICAgICAgYnJlYWs7XG4gICAgZWxzZVxuICAgICAgY29kZSA9IDQ3IC8qLyovO1xuICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgaWYgKGxhc3RTbGFzaCA9PT0gaSAtIDEgfHwgZG90cyA9PT0gMSkge1xuICAgICAgICAvLyBOT09QXG4gICAgICB9IGVsc2UgaWYgKGxhc3RTbGFzaCAhPT0gaSAtIDEgJiYgZG90cyA9PT0gMikge1xuICAgICAgICBpZiAocmVzLmxlbmd0aCA8IDIgfHwgbGFzdFNlZ21lbnRMZW5ndGggIT09IDIgfHwgcmVzLmNoYXJDb2RlQXQocmVzLmxlbmd0aCAtIDEpICE9PSA0NiAvKi4qLyB8fCByZXMuY2hhckNvZGVBdChyZXMubGVuZ3RoIC0gMikgIT09IDQ2IC8qLiovKSB7XG4gICAgICAgICAgaWYgKHJlcy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICB2YXIgbGFzdFNsYXNoSW5kZXggPSByZXMubGFzdEluZGV4T2YoJy8nKTtcbiAgICAgICAgICAgIGlmIChsYXN0U2xhc2hJbmRleCAhPT0gcmVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgaWYgKGxhc3RTbGFzaEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJlcyA9ICcnO1xuICAgICAgICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gMDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMuc2xpY2UoMCwgbGFzdFNsYXNoSW5kZXgpO1xuICAgICAgICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gcmVzLmxlbmd0aCAtIDEgLSByZXMubGFzdEluZGV4T2YoJy8nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBsYXN0U2xhc2ggPSBpO1xuICAgICAgICAgICAgICBkb3RzID0gMDtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChyZXMubGVuZ3RoID09PSAyIHx8IHJlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJlcyA9ICcnO1xuICAgICAgICAgICAgbGFzdFNlZ21lbnRMZW5ndGggPSAwO1xuICAgICAgICAgICAgbGFzdFNsYXNoID0gaTtcbiAgICAgICAgICAgIGRvdHMgPSAwO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgICAgICAgIGlmIChyZXMubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHJlcyArPSAnLy4uJztcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXMgPSAnLi4nO1xuICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHJlcy5sZW5ndGggPiAwKVxuICAgICAgICAgIHJlcyArPSAnLycgKyBwYXRoLnNsaWNlKGxhc3RTbGFzaCArIDEsIGkpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmVzID0gcGF0aC5zbGljZShsYXN0U2xhc2ggKyAxLCBpKTtcbiAgICAgICAgbGFzdFNlZ21lbnRMZW5ndGggPSBpIC0gbGFzdFNsYXNoIC0gMTtcbiAgICAgIH1cbiAgICAgIGxhc3RTbGFzaCA9IGk7XG4gICAgICBkb3RzID0gMDtcbiAgICB9IGVsc2UgaWYgKGNvZGUgPT09IDQ2IC8qLiovICYmIGRvdHMgIT09IC0xKSB7XG4gICAgICArK2RvdHM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvdHMgPSAtMTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gX2Zvcm1hdChzZXAsIHBhdGhPYmplY3QpIHtcbiAgdmFyIGRpciA9IHBhdGhPYmplY3QuZGlyIHx8IHBhdGhPYmplY3Qucm9vdDtcbiAgdmFyIGJhc2UgPSBwYXRoT2JqZWN0LmJhc2UgfHwgKHBhdGhPYmplY3QubmFtZSB8fCAnJykgKyAocGF0aE9iamVjdC5leHQgfHwgJycpO1xuICBpZiAoIWRpcikge1xuICAgIHJldHVybiBiYXNlO1xuICB9XG4gIGlmIChkaXIgPT09IHBhdGhPYmplY3Qucm9vdCkge1xuICAgIHJldHVybiBkaXIgKyBiYXNlO1xuICB9XG4gIHJldHVybiBkaXIgKyBzZXAgKyBiYXNlO1xufVxuXG52YXIgcG9zaXggPSB7XG4gIC8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbiAgcmVzb2x2ZTogZnVuY3Rpb24gcmVzb2x2ZSgpIHtcbiAgICB2YXIgcmVzb2x2ZWRQYXRoID0gJyc7XG4gICAgdmFyIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcbiAgICB2YXIgY3dkO1xuXG4gICAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICAgIHZhciBwYXRoO1xuICAgICAgaWYgKGkgPj0gMClcbiAgICAgICAgcGF0aCA9IGFyZ3VtZW50c1tpXTtcbiAgICAgIGVsc2Uge1xuICAgICAgICBpZiAoY3dkID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgICAgICAgcGF0aCA9IGN3ZDtcbiAgICAgIH1cblxuICAgICAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICAgICAgLy8gU2tpcCBlbXB0eSBlbnRyaWVzXG4gICAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLztcbiAgICB9XG5cbiAgICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gICAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVTdHJpbmdQb3NpeChyZXNvbHZlZFBhdGgsICFyZXNvbHZlZEFic29sdXRlKTtcblxuICAgIGlmIChyZXNvbHZlZEFic29sdXRlKSB7XG4gICAgICBpZiAocmVzb2x2ZWRQYXRoLmxlbmd0aCA+IDApXG4gICAgICAgIHJldHVybiAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgICBlbHNlXG4gICAgICAgIHJldHVybiAnLyc7XG4gICAgfSBlbHNlIGlmIChyZXNvbHZlZFBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHJlc29sdmVkUGF0aDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICcuJztcbiAgICB9XG4gIH0sXG5cbiAgbm9ybWFsaXplOiBmdW5jdGlvbiBub3JtYWxpemUocGF0aCkge1xuICAgIGFzc2VydFBhdGgocGF0aCk7XG5cbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiAnLic7XG5cbiAgICB2YXIgaXNBYnNvbHV0ZSA9IHBhdGguY2hhckNvZGVBdCgwKSA9PT0gNDcgLyovKi87XG4gICAgdmFyIHRyYWlsaW5nU2VwYXJhdG9yID0gcGF0aC5jaGFyQ29kZUF0KHBhdGgubGVuZ3RoIC0gMSkgPT09IDQ3IC8qLyovO1xuXG4gICAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gICAgcGF0aCA9IG5vcm1hbGl6ZVN0cmluZ1Bvc2l4KHBhdGgsICFpc0Fic29sdXRlKTtcblxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCAmJiAhaXNBYnNvbHV0ZSkgcGF0aCA9ICcuJztcbiAgICBpZiAocGF0aC5sZW5ndGggPiAwICYmIHRyYWlsaW5nU2VwYXJhdG9yKSBwYXRoICs9ICcvJztcblxuICAgIGlmIChpc0Fic29sdXRlKSByZXR1cm4gJy8nICsgcGF0aDtcbiAgICByZXR1cm4gcGF0aDtcbiAgfSxcblxuICBpc0Fic29sdXRlOiBmdW5jdGlvbiBpc0Fic29sdXRlKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIHJldHVybiBwYXRoLmxlbmd0aCA+IDAgJiYgcGF0aC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLztcbiAgfSxcblxuICBqb2luOiBmdW5jdGlvbiBqb2luKCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgcmV0dXJuICcuJztcbiAgICB2YXIgam9pbmVkO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgYXJnID0gYXJndW1lbnRzW2ldO1xuICAgICAgYXNzZXJ0UGF0aChhcmcpO1xuICAgICAgaWYgKGFyZy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChqb2luZWQgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBqb2luZWQgPSBhcmc7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBqb2luZWQgKz0gJy8nICsgYXJnO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoam9pbmVkID09PSB1bmRlZmluZWQpXG4gICAgICByZXR1cm4gJy4nO1xuICAgIHJldHVybiBwb3NpeC5ub3JtYWxpemUoam9pbmVkKTtcbiAgfSxcblxuICByZWxhdGl2ZTogZnVuY3Rpb24gcmVsYXRpdmUoZnJvbSwgdG8pIHtcbiAgICBhc3NlcnRQYXRoKGZyb20pO1xuICAgIGFzc2VydFBhdGgodG8pO1xuXG4gICAgaWYgKGZyb20gPT09IHRvKSByZXR1cm4gJyc7XG5cbiAgICBmcm9tID0gcG9zaXgucmVzb2x2ZShmcm9tKTtcbiAgICB0byA9IHBvc2l4LnJlc29sdmUodG8pO1xuXG4gICAgaWYgKGZyb20gPT09IHRvKSByZXR1cm4gJyc7XG5cbiAgICAvLyBUcmltIGFueSBsZWFkaW5nIGJhY2tzbGFzaGVzXG4gICAgdmFyIGZyb21TdGFydCA9IDE7XG4gICAgZm9yICg7IGZyb21TdGFydCA8IGZyb20ubGVuZ3RoOyArK2Zyb21TdGFydCkge1xuICAgICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQpICE9PSA0NyAvKi8qLylcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHZhciBmcm9tRW5kID0gZnJvbS5sZW5ndGg7XG4gICAgdmFyIGZyb21MZW4gPSBmcm9tRW5kIC0gZnJvbVN0YXJ0O1xuXG4gICAgLy8gVHJpbSBhbnkgbGVhZGluZyBiYWNrc2xhc2hlc1xuICAgIHZhciB0b1N0YXJ0ID0gMTtcbiAgICBmb3IgKDsgdG9TdGFydCA8IHRvLmxlbmd0aDsgKyt0b1N0YXJ0KSB7XG4gICAgICBpZiAodG8uY2hhckNvZGVBdCh0b1N0YXJ0KSAhPT0gNDcgLyovKi8pXG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB2YXIgdG9FbmQgPSB0by5sZW5ndGg7XG4gICAgdmFyIHRvTGVuID0gdG9FbmQgLSB0b1N0YXJ0O1xuXG4gICAgLy8gQ29tcGFyZSBwYXRocyB0byBmaW5kIHRoZSBsb25nZXN0IGNvbW1vbiBwYXRoIGZyb20gcm9vdFxuICAgIHZhciBsZW5ndGggPSBmcm9tTGVuIDwgdG9MZW4gPyBmcm9tTGVuIDogdG9MZW47XG4gICAgdmFyIGxhc3RDb21tb25TZXAgPSAtMTtcbiAgICB2YXIgaSA9IDA7XG4gICAgZm9yICg7IGkgPD0gbGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChpID09PSBsZW5ndGgpIHtcbiAgICAgICAgaWYgKHRvTGVuID4gbGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKHRvLmNoYXJDb2RlQXQodG9TdGFydCArIGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYGZyb21gIGlzIHRoZSBleGFjdCBiYXNlIHBhdGggZm9yIGB0b2AuXG4gICAgICAgICAgICAvLyBGb3IgZXhhbXBsZTogZnJvbT0nL2Zvby9iYXInOyB0bz0nL2Zvby9iYXIvYmF6J1xuICAgICAgICAgICAgcmV0dXJuIHRvLnNsaWNlKHRvU3RhcnQgKyBpICsgMSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChpID09PSAwKSB7XG4gICAgICAgICAgICAvLyBXZSBnZXQgaGVyZSBpZiBgZnJvbWAgaXMgdGhlIHJvb3RcbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPScvJzsgdG89Jy9mb28nXG4gICAgICAgICAgICByZXR1cm4gdG8uc2xpY2UodG9TdGFydCArIGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmcm9tTGVuID4gbGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQgKyBpKSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgICAgIC8vIFdlIGdldCBoZXJlIGlmIGB0b2AgaXMgdGhlIGV4YWN0IGJhc2UgcGF0aCBmb3IgYGZyb21gLlxuICAgICAgICAgICAgLy8gRm9yIGV4YW1wbGU6IGZyb209Jy9mb28vYmFyL2Jheic7IHRvPScvZm9vL2JhcidcbiAgICAgICAgICAgIGxhc3RDb21tb25TZXAgPSBpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYHRvYCBpcyB0aGUgcm9vdC5cbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPScvZm9vJzsgdG89Jy8nXG4gICAgICAgICAgICBsYXN0Q29tbW9uU2VwID0gMDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICB2YXIgZnJvbUNvZGUgPSBmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSk7XG4gICAgICB2YXIgdG9Db2RlID0gdG8uY2hhckNvZGVBdCh0b1N0YXJ0ICsgaSk7XG4gICAgICBpZiAoZnJvbUNvZGUgIT09IHRvQ29kZSlcbiAgICAgICAgYnJlYWs7XG4gICAgICBlbHNlIGlmIChmcm9tQ29kZSA9PT0gNDcgLyovKi8pXG4gICAgICAgIGxhc3RDb21tb25TZXAgPSBpO1xuICAgIH1cblxuICAgIHZhciBvdXQgPSAnJztcbiAgICAvLyBHZW5lcmF0ZSB0aGUgcmVsYXRpdmUgcGF0aCBiYXNlZCBvbiB0aGUgcGF0aCBkaWZmZXJlbmNlIGJldHdlZW4gYHRvYFxuICAgIC8vIGFuZCBgZnJvbWBcbiAgICBmb3IgKGkgPSBmcm9tU3RhcnQgKyBsYXN0Q29tbW9uU2VwICsgMTsgaSA8PSBmcm9tRW5kOyArK2kpIHtcbiAgICAgIGlmIChpID09PSBmcm9tRW5kIHx8IGZyb20uY2hhckNvZGVBdChpKSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgaWYgKG91dC5sZW5ndGggPT09IDApXG4gICAgICAgICAgb3V0ICs9ICcuLic7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBvdXQgKz0gJy8uLic7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGFzdGx5LCBhcHBlbmQgdGhlIHJlc3Qgb2YgdGhlIGRlc3RpbmF0aW9uIChgdG9gKSBwYXRoIHRoYXQgY29tZXMgYWZ0ZXJcbiAgICAvLyB0aGUgY29tbW9uIHBhdGggcGFydHNcbiAgICBpZiAob3V0Lmxlbmd0aCA+IDApXG4gICAgICByZXR1cm4gb3V0ICsgdG8uc2xpY2UodG9TdGFydCArIGxhc3RDb21tb25TZXApO1xuICAgIGVsc2Uge1xuICAgICAgdG9TdGFydCArPSBsYXN0Q29tbW9uU2VwO1xuICAgICAgaWYgKHRvLmNoYXJDb2RlQXQodG9TdGFydCkgPT09IDQ3IC8qLyovKVxuICAgICAgICArK3RvU3RhcnQ7XG4gICAgICByZXR1cm4gdG8uc2xpY2UodG9TdGFydCk7XG4gICAgfVxuICB9LFxuXG4gIF9tYWtlTG9uZzogZnVuY3Rpb24gX21ha2VMb25nKHBhdGgpIHtcbiAgICByZXR1cm4gcGF0aDtcbiAgfSxcblxuICBkaXJuYW1lOiBmdW5jdGlvbiBkaXJuYW1lKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcuJztcbiAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdCgwKTtcbiAgICB2YXIgaGFzUm9vdCA9IGNvZGUgPT09IDQ3IC8qLyovO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICBmb3IgKHZhciBpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDE7IC0taSkge1xuICAgICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIGlmICghbWF0Y2hlZFNsYXNoKSB7XG4gICAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvclxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZW5kID09PSAtMSkgcmV0dXJuIGhhc1Jvb3QgPyAnLycgOiAnLic7XG4gICAgaWYgKGhhc1Jvb3QgJiYgZW5kID09PSAxKSByZXR1cm4gJy8vJztcbiAgICByZXR1cm4gcGF0aC5zbGljZSgwLCBlbmQpO1xuICB9LFxuXG4gIGJhc2VuYW1lOiBmdW5jdGlvbiBiYXNlbmFtZShwYXRoLCBleHQpIHtcbiAgICBpZiAoZXh0ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGV4dCAhPT0gJ3N0cmluZycpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wiZXh0XCIgYXJndW1lbnQgbXVzdCBiZSBhIHN0cmluZycpO1xuICAgIGFzc2VydFBhdGgocGF0aCk7XG5cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICB2YXIgaTtcblxuICAgIGlmIChleHQgIT09IHVuZGVmaW5lZCAmJiBleHQubGVuZ3RoID4gMCAmJiBleHQubGVuZ3RoIDw9IHBhdGgubGVuZ3RoKSB7XG4gICAgICBpZiAoZXh0Lmxlbmd0aCA9PT0gcGF0aC5sZW5ndGggJiYgZXh0ID09PSBwYXRoKSByZXR1cm4gJyc7XG4gICAgICB2YXIgZXh0SWR4ID0gZXh0Lmxlbmd0aCAtIDE7XG4gICAgICB2YXIgZmlyc3ROb25TbGFzaEVuZCA9IC0xO1xuICAgICAgZm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNvZGUgPT09IDQ3IC8qLyovKSB7XG4gICAgICAgICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICAgICAgICBzdGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChmaXJzdE5vblNsYXNoRW5kID09PSAtMSkge1xuICAgICAgICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIHJlbWVtYmVyIHRoaXMgaW5kZXggaW4gY2FzZVxuICAgICAgICAgICAgLy8gd2UgbmVlZCBpdCBpZiB0aGUgZXh0ZW5zaW9uIGVuZHMgdXAgbm90IG1hdGNoaW5nXG4gICAgICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZpcnN0Tm9uU2xhc2hFbmQgPSBpICsgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGV4dElkeCA+PSAwKSB7XG4gICAgICAgICAgICAvLyBUcnkgdG8gbWF0Y2ggdGhlIGV4cGxpY2l0IGV4dGVuc2lvblxuICAgICAgICAgICAgaWYgKGNvZGUgPT09IGV4dC5jaGFyQ29kZUF0KGV4dElkeCkpIHtcbiAgICAgICAgICAgICAgaWYgKC0tZXh0SWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgdGhlIGV4dGVuc2lvbiwgc28gbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyIHBhdGhcbiAgICAgICAgICAgICAgICAvLyBjb21wb25lbnRcbiAgICAgICAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBFeHRlbnNpb24gZG9lcyBub3QgbWF0Y2gsIHNvIG91ciByZXN1bHQgaXMgdGhlIGVudGlyZSBwYXRoXG4gICAgICAgICAgICAgIC8vIGNvbXBvbmVudFxuICAgICAgICAgICAgICBleHRJZHggPSAtMTtcbiAgICAgICAgICAgICAgZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXJ0ID09PSBlbmQpIGVuZCA9IGZpcnN0Tm9uU2xhc2hFbmQ7ZWxzZSBpZiAoZW5kID09PSAtMSkgZW5kID0gcGF0aC5sZW5ndGg7XG4gICAgICByZXR1cm4gcGF0aC5zbGljZShzdGFydCwgZW5kKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICBpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAgICAgLy8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcbiAgICAgICAgICAgIC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgICAgc3RhcnQgPSBpICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91clxuICAgICAgICAgIC8vIHBhdGggY29tcG9uZW50XG4gICAgICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHJldHVybiAnJztcbiAgICAgIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgIH1cbiAgfSxcblxuICBleHRuYW1lOiBmdW5jdGlvbiBleHRuYW1lKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIHZhciBzdGFydERvdCA9IC0xO1xuICAgIHZhciBzdGFydFBhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICAvLyBUcmFjayB0aGUgc3RhdGUgb2YgY2hhcmFjdGVycyAoaWYgYW55KSB3ZSBzZWUgYmVmb3JlIG91ciBmaXJzdCBkb3QgYW5kXG4gICAgLy8gYWZ0ZXIgYW55IHBhdGggc2VwYXJhdG9yIHdlIGZpbmRcbiAgICB2YXIgcHJlRG90U3RhdGUgPSAwO1xuICAgIGZvciAodmFyIGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgIHN0YXJ0UGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG4gICAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICB9XG4gICAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8pIHtcbiAgICAgICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKVxuICAgICAgICAgICAgc3RhcnREb3QgPSBpO1xuICAgICAgICAgIGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKVxuICAgICAgICAgICAgcHJlRG90U3RhdGUgPSAxO1xuICAgICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBhbmQgbm9uLXBhdGggc2VwYXJhdG9yIGJlZm9yZSBvdXIgZG90LCBzbyB3ZSBzaG91bGRcbiAgICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnREb3QgPT09IC0xIHx8IGVuZCA9PT0gLTEgfHxcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBjaGFyYWN0ZXIgaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBkb3RcbiAgICAgICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAgICAgLy8gVGhlIChyaWdodC1tb3N0KSB0cmltbWVkIHBhdGggY29tcG9uZW50IGlzIGV4YWN0bHkgJy4uJ1xuICAgICAgICBwcmVEb3RTdGF0ZSA9PT0gMSAmJiBzdGFydERvdCA9PT0gZW5kIC0gMSAmJiBzdGFydERvdCA9PT0gc3RhcnRQYXJ0ICsgMSkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcbiAgfSxcblxuICBmb3JtYXQ6IGZ1bmN0aW9uIGZvcm1hdChwYXRoT2JqZWN0KSB7XG4gICAgaWYgKHBhdGhPYmplY3QgPT09IG51bGwgfHwgdHlwZW9mIHBhdGhPYmplY3QgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdUaGUgXCJwYXRoT2JqZWN0XCIgYXJndW1lbnQgbXVzdCBiZSBvZiB0eXBlIE9iamVjdC4gUmVjZWl2ZWQgdHlwZSAnICsgdHlwZW9mIHBhdGhPYmplY3QpO1xuICAgIH1cbiAgICByZXR1cm4gX2Zvcm1hdCgnLycsIHBhdGhPYmplY3QpO1xuICB9LFxuXG4gIHBhcnNlOiBmdW5jdGlvbiBwYXJzZShwYXRoKSB7XG4gICAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICAgIHZhciByZXQgPSB7IHJvb3Q6ICcnLCBkaXI6ICcnLCBiYXNlOiAnJywgZXh0OiAnJywgbmFtZTogJycgfTtcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiByZXQ7XG4gICAgdmFyIGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG4gICAgdmFyIGlzQWJzb2x1dGUgPSBjb2RlID09PSA0NyAvKi8qLztcbiAgICB2YXIgc3RhcnQ7XG4gICAgaWYgKGlzQWJzb2x1dGUpIHtcbiAgICAgIHJldC5yb290ID0gJy8nO1xuICAgICAgc3RhcnQgPSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGFydCA9IDA7XG4gICAgfVxuICAgIHZhciBzdGFydERvdCA9IC0xO1xuICAgIHZhciBzdGFydFBhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICB2YXIgaSA9IHBhdGgubGVuZ3RoIC0gMTtcblxuICAgIC8vIFRyYWNrIHRoZSBzdGF0ZSBvZiBjaGFyYWN0ZXJzIChpZiBhbnkpIHdlIHNlZSBiZWZvcmUgb3VyIGZpcnN0IGRvdCBhbmRcbiAgICAvLyBhZnRlciBhbnkgcGF0aCBzZXBhcmF0b3Igd2UgZmluZFxuICAgIHZhciBwcmVEb3RTdGF0ZSA9IDA7XG5cbiAgICAvLyBHZXQgbm9uLWRpciBpbmZvXG4gICAgZm9yICg7IGkgPj0gc3RhcnQ7IC0taSkge1xuICAgICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgIHN0YXJ0UGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG4gICAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICB9XG4gICAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8pIHtcbiAgICAgICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKSBzdGFydERvdCA9IGk7ZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpIHByZURvdFN0YXRlID0gMTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBhbmQgbm9uLXBhdGggc2VwYXJhdG9yIGJlZm9yZSBvdXIgZG90LCBzbyB3ZSBzaG91bGRcbiAgICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnREb3QgPT09IC0xIHx8IGVuZCA9PT0gLTEgfHxcbiAgICAvLyBXZSBzYXcgYSBub24tZG90IGNoYXJhY3RlciBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvdFxuICAgIHByZURvdFN0YXRlID09PSAwIHx8XG4gICAgLy8gVGhlIChyaWdodC1tb3N0KSB0cmltbWVkIHBhdGggY29tcG9uZW50IGlzIGV4YWN0bHkgJy4uJ1xuICAgIHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKSB7XG4gICAgICBpZiAoZW5kICE9PSAtMSkge1xuICAgICAgICBpZiAoc3RhcnRQYXJ0ID09PSAwICYmIGlzQWJzb2x1dGUpIHJldC5iYXNlID0gcmV0Lm5hbWUgPSBwYXRoLnNsaWNlKDEsIGVuZCk7ZWxzZSByZXQuYmFzZSA9IHJldC5uYW1lID0gcGF0aC5zbGljZShzdGFydFBhcnQsIGVuZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGFydFBhcnQgPT09IDAgJiYgaXNBYnNvbHV0ZSkge1xuICAgICAgICByZXQubmFtZSA9IHBhdGguc2xpY2UoMSwgc3RhcnREb3QpO1xuICAgICAgICByZXQuYmFzZSA9IHBhdGguc2xpY2UoMSwgZW5kKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldC5uYW1lID0gcGF0aC5zbGljZShzdGFydFBhcnQsIHN0YXJ0RG90KTtcbiAgICAgICAgcmV0LmJhc2UgPSBwYXRoLnNsaWNlKHN0YXJ0UGFydCwgZW5kKTtcbiAgICAgIH1cbiAgICAgIHJldC5leHQgPSBwYXRoLnNsaWNlKHN0YXJ0RG90LCBlbmQpO1xuICAgIH1cblxuICAgIGlmIChzdGFydFBhcnQgPiAwKSByZXQuZGlyID0gcGF0aC5zbGljZSgwLCBzdGFydFBhcnQgLSAxKTtlbHNlIGlmIChpc0Fic29sdXRlKSByZXQuZGlyID0gJy8nO1xuXG4gICAgcmV0dXJuIHJldDtcbiAgfSxcblxuICBzZXA6ICcvJyxcbiAgZGVsaW1pdGVyOiAnOicsXG4gIHdpbjMyOiBudWxsLFxuICBwb3NpeDogbnVsbFxufTtcblxucG9zaXgucG9zaXggPSBwb3NpeDtcblxubW9kdWxlLmV4cG9ydHMgPSBwb3NpeDtcbiIsImltcG9ydCB7IGV4dG5hbWUgfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSBcInN0cmVhbVwiO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJU3RyaW5nS2V5TWFwPFQ+IHtcclxuICBba2V5OiBzdHJpbmddOiBUO1xyXG59XHJcblxyXG5jb25zdCBJTUFHRV9FWFRfTElTVCA9IFtcclxuICBcIi5wbmdcIixcclxuICBcIi5qcGdcIixcclxuICBcIi5qcGVnXCIsXHJcbiAgXCIuYm1wXCIsXHJcbiAgXCIuZ2lmXCIsXHJcbiAgXCIuc3ZnXCIsXHJcbiAgXCIudGlmZlwiLFxyXG4gIFwiLndlYnBcIixcclxuICBcIi5hdmlmXCIsXHJcbl07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNBbkltYWdlKGV4dDogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIElNQUdFX0VYVF9MSVNULmluY2x1ZGVzKGV4dC50b0xvd2VyQ2FzZSgpKTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gaXNBc3NldFR5cGVBbkltYWdlKHBhdGg6IHN0cmluZyk6IEJvb2xlYW4ge1xyXG4gIHJldHVybiBpc0FuSW1hZ2UoZXh0bmFtZShwYXRoKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdHJlYW1Ub1N0cmluZyhzdHJlYW06IFJlYWRhYmxlKSB7XHJcbiAgY29uc3QgY2h1bmtzID0gW107XHJcblxyXG4gIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2Ygc3RyZWFtKSB7XHJcbiAgICBjaHVua3MucHVzaChCdWZmZXIuZnJvbShjaHVuaykpO1xyXG4gIH1cclxuXHJcbiAgLy8gQHRzLWlnbm9yZVxyXG4gIHJldHVybiBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoXCJ1dGYtOFwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFVybEFzc2V0KHVybDogc3RyaW5nKSB7XHJcbiAgcmV0dXJuICh1cmwgPSB1cmwuc3Vic3RyKDEgKyB1cmwubGFzdEluZGV4T2YoXCIvXCIpKS5zcGxpdChcIj9cIilbMF0pLnNwbGl0KFxyXG4gICAgXCIjXCJcclxuICApWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdEltYWdlKGxpc3Q6IHN0cmluZ1tdKSB7XHJcbiAgY29uc3QgcmV2ZXJzZWRMaXN0ID0gbGlzdC5yZXZlcnNlKCk7XHJcbiAgbGV0IGxhc3RJbWFnZTtcclxuICByZXZlcnNlZExpc3QuZm9yRWFjaChpdGVtID0+IHtcclxuICAgIGlmIChpdGVtICYmIGl0ZW0uc3RhcnRzV2l0aChcImh0dHBcIikpIHtcclxuICAgICAgbGFzdEltYWdlID0gaXRlbTtcclxuICAgICAgcmV0dXJuIGl0ZW07XHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGxhc3RJbWFnZTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFueU9iaiB7XHJcbiAgW2tleTogc3RyaW5nXTogYW55O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXJyYXlUb09iamVjdDxUIGV4dGVuZHMgQW55T2JqPihcclxuICBhcnI6IFRbXSxcclxuICBrZXk6IHN0cmluZ1xyXG4pOiB7IFtrZXk6IHN0cmluZ106IFQgfSB7XHJcbiAgY29uc3Qgb2JqOiB7IFtrZXk6IHN0cmluZ106IFQgfSA9IHt9O1xyXG4gIGFyci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xyXG4gICAgb2JqW2VsZW1lbnRba2V5XV0gPSBlbGVtZW50O1xyXG4gIH0pO1xyXG4gIHJldHVybiBvYmo7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBidWZmZXJUb0FycmF5QnVmZmVyKGJ1ZmZlcjogQnVmZmVyKSB7XHJcbiAgY29uc3QgYXJyYXlCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoYnVmZmVyLmxlbmd0aCk7XHJcbiAgY29uc3QgdmlldyA9IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xyXG4gICAgdmlld1tpXSA9IGJ1ZmZlcltpXTtcclxuICB9XHJcbiAgcmV0dXJuIGFycmF5QnVmZmVyO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXJyYXlCdWZmZXJUb0J1ZmZlcihhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcclxuICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2MoYXJyYXlCdWZmZXIuYnl0ZUxlbmd0aCk7XHJcbiAgY29uc3QgdmlldyA9IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7ICsraSkge1xyXG4gICAgYnVmZmVyW2ldID0gdmlld1tpXTtcclxuICB9XHJcbiAgcmV0dXJuIGJ1ZmZlcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHV1aWQoKSB7XHJcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpO1xyXG59XHJcbiIsImltcG9ydCAqIGFzIGllZWU3NTQgZnJvbSAnaWVlZTc1NCc7XG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tICdub2RlOmJ1ZmZlcic7XG4vLyBQcmltaXRpdmUgdHlwZXNcbmZ1bmN0aW9uIGR2KGFycmF5KSB7XG4gICAgcmV0dXJuIG5ldyBEYXRhVmlldyhhcnJheS5idWZmZXIsIGFycmF5LmJ5dGVPZmZzZXQpO1xufVxuLyoqXG4gKiA4LWJpdCB1bnNpZ25lZCBpbnRlZ2VyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UOCA9IHtcbiAgICBsZW46IDEsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRVaW50OChvZmZzZXQpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50OChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDE7XG4gICAgfVxufTtcbi8qKlxuICogMTYtYml0IHVuc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgVUlOVDE2X0xFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldFVpbnQxNihvZmZzZXQsIHRydWUpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50MTYob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyAyO1xuICAgIH1cbn07XG4vKipcbiAqIDE2LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQxNl9CRSA9IHtcbiAgICBsZW46IDIsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRVaW50MTYob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0VWludDE2KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMjtcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgdW5zaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMjRfTEUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICByZXR1cm4gZGF0YVZpZXcuZ2V0VWludDgob2Zmc2V0KSArIChkYXRhVmlldy5nZXRVaW50MTYob2Zmc2V0ICsgMSwgdHJ1ZSkgPDwgOCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQ4KG9mZnNldCwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDE2KG9mZnNldCArIDEsIHZhbHVlID4+IDgsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgdW5zaWduZWQgaW50ZWdlciwgQmlnIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMjRfQkUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICByZXR1cm4gKGRhdGFWaWV3LmdldFVpbnQxNihvZmZzZXQpIDw8IDgpICsgZGF0YVZpZXcuZ2V0VWludDgob2Zmc2V0ICsgMik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQxNihvZmZzZXQsIHZhbHVlID4+IDgpO1xuICAgICAgICBkYXRhVmlldy5zZXRVaW50OChvZmZzZXQgKyAyLCB2YWx1ZSAmIDB4ZmYpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAzMi1iaXQgdW5zaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0VWludDMyKG9mZnNldCwgdHJ1ZSk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldFVpbnQzMihvZmZzZXQsIHZhbHVlLCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDQ7XG4gICAgfVxufTtcbi8qKlxuICogMzItYml0IHVuc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgVUlOVDMyX0JFID0ge1xuICAgIGxlbjogNCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldFVpbnQzMihvZmZzZXQpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50MzIob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIDgtYml0IHNpZ25lZCBpbnRlZ2VyXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQ4ID0ge1xuICAgIGxlbjogMSxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDgob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50OChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDE7XG4gICAgfVxufTtcbi8qKlxuICogMTYtYml0IHNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IElOVDE2X0JFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDE2KG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEludDE2KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMjtcbiAgICB9XG59O1xuLyoqXG4gKiAxNi1iaXQgc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMTZfTEUgPSB7XG4gICAgbGVuOiAyLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0SW50MTYob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50MTYob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyAyO1xuICAgIH1cbn07XG4vKipcbiAqIDI0LWJpdCBzaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQyNF9MRSA9IHtcbiAgICBsZW46IDMsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgY29uc3QgdW5zaWduZWQgPSBVSU5UMjRfTEUuZ2V0KGFycmF5LCBvZmZzZXQpO1xuICAgICAgICByZXR1cm4gdW5zaWduZWQgPiAweDdmZmZmZiA/IHVuc2lnbmVkIC0gMHgxMDAwMDAwIDogdW5zaWduZWQ7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQ4KG9mZnNldCwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDE2KG9mZnNldCArIDEsIHZhbHVlID4+IDgsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMjRfQkUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IHVuc2lnbmVkID0gVUlOVDI0X0JFLmdldChhcnJheSwgb2Zmc2V0KTtcbiAgICAgICAgcmV0dXJuIHVuc2lnbmVkID4gMHg3ZmZmZmYgPyB1bnNpZ25lZCAtIDB4MTAwMDAwMCA6IHVuc2lnbmVkO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICBkYXRhVmlldy5zZXRVaW50MTYob2Zmc2V0LCB2YWx1ZSA+PiA4KTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDgob2Zmc2V0ICsgMiwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDM7XG4gICAgfVxufTtcbi8qKlxuICogMzItYml0IHNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IElOVDMyX0JFID0ge1xuICAgIGxlbjogNCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDMyKG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEludDMyKG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgNDtcbiAgICB9XG59O1xuLyoqXG4gKiAzMi1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0SW50MzIob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50MzIob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIDY0LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBMaXR0bGUgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQ2NF9MRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRCaWdVaW50NjQob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnVWludDY0KG9mZnNldCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgODtcbiAgICB9XG59O1xuLyoqXG4gKiA2NC1iaXQgc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UNjRfTEUgPSB7XG4gICAgbGVuOiA4LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0QmlnSW50NjQob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnSW50NjQob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIDY0LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQ2NF9CRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRCaWdVaW50NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnVWludDY0KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgODtcbiAgICB9XG59O1xuLyoqXG4gKiA2NC1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UNjRfQkUgPSB7XG4gICAgbGVuOiA4LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0QmlnSW50NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnSW50NjQob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDE2LWJpdCAoaGFsZiBwcmVjaXNpb24pIGZsb2F0LCBiaWcgZW5kaWFuXG4gKi9cbmV4cG9ydCBjb25zdCBGbG9hdDE2X0JFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoZGF0YVZpZXcsIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGRhdGFWaWV3LCBvZmZzZXQsIGZhbHNlLCAxMCwgdGhpcy5sZW4pO1xuICAgIH0sXG4gICAgcHV0KGRhdGFWaWV3LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGllZWU3NTQud3JpdGUoZGF0YVZpZXcsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCAxMCwgdGhpcy5sZW4pO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgdGhpcy5sZW47XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgMTYtYml0IChoYWxmIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0MTZfTEUgPSB7XG4gICAgbGVuOiAyLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBpZWVlNzU0LnJlYWQoYXJyYXksIG9mZnNldCwgdHJ1ZSwgMTAsIHRoaXMubGVuKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBpZWVlNzU0LndyaXRlKGFycmF5LCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCAxMCwgdGhpcy5sZW4pO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgdGhpcy5sZW47XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgMzItYml0IChzaW5nbGUgcHJlY2lzaW9uKSBmbG9hdCwgYmlnIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQzMl9CRSA9IHtcbiAgICBsZW46IDQsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRGbG9hdDMyKG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEZsb2F0MzIob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDMyLWJpdCAoc2luZ2xlIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0MzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0RmxvYXQzMihvZmZzZXQsIHRydWUpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRGbG9hdDMyKG9mZnNldCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgNDtcbiAgICB9XG59O1xuLyoqXG4gKiBJRUVFIDc1NCA2NC1iaXQgKGRvdWJsZSBwcmVjaXNpb24pIGZsb2F0LCBiaWcgZW5kaWFuXG4gKi9cbmV4cG9ydCBjb25zdCBGbG9hdDY0X0JFID0ge1xuICAgIGxlbjogOCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEZsb2F0NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0RmxvYXQ2NChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDg7XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgNjQtYml0IChkb3VibGUgcHJlY2lzaW9uKSBmbG9hdCwgbGl0dGxlIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQ2NF9MRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRGbG9hdDY0KG9mZnNldCwgdHJ1ZSk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEZsb2F0NjQob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDgwLWJpdCAoZXh0ZW5kZWQgcHJlY2lzaW9uKSBmbG9hdCwgYmlnIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQ4MF9CRSA9IHtcbiAgICBsZW46IDEwLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBpZWVlNzU0LnJlYWQoYXJyYXksIG9mZnNldCwgZmFsc2UsIDYzLCB0aGlzLmxlbik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgaWVlZTc1NC53cml0ZShhcnJheSwgdmFsdWUsIG9mZnNldCwgZmFsc2UsIDYzLCB0aGlzLmxlbik7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyB0aGlzLmxlbjtcbiAgICB9XG59O1xuLyoqXG4gKiBJRUVFIDc1NCA4MC1iaXQgKGV4dGVuZGVkIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0ODBfTEUgPSB7XG4gICAgbGVuOiAxMCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGFycmF5LCBvZmZzZXQsIHRydWUsIDYzLCB0aGlzLmxlbik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgaWVlZTc1NC53cml0ZShhcnJheSwgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgNjMsIHRoaXMubGVuKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIHRoaXMubGVuO1xuICAgIH1cbn07XG4vKipcbiAqIElnbm9yZSBhIGdpdmVuIG51bWJlciBvZiBieXRlc1xuICovXG5leHBvcnQgY2xhc3MgSWdub3JlVHlwZSB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIGxlbiBudW1iZXIgb2YgYnl0ZXMgdG8gaWdub3JlXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICAvLyBUb0RvOiBkb24ndCByZWFkLCBidXQgc2tpcCBkYXRhXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1lbXB0eS1mdW5jdGlvblxuICAgIGdldChhcnJheSwgb2ZmKSB7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVpbnQ4QXJyYXlUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcihsZW4pIHtcbiAgICAgICAgdGhpcy5sZW4gPSBsZW47XG4gICAgfVxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBhcnJheS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIHRoaXMubGVuKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgQnVmZmVyVHlwZSB7XG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICBnZXQodWludDhBcnJheSwgb2ZmKSB7XG4gICAgICAgIHJldHVybiBCdWZmZXIuZnJvbSh1aW50OEFycmF5LnN1YmFycmF5KG9mZiwgb2ZmICsgdGhpcy5sZW4pKTtcbiAgICB9XG59XG4vKipcbiAqIENvbnN1bWUgYSBmaXhlZCBudW1iZXIgb2YgYnl0ZXMgZnJvbSB0aGUgc3RyZWFtIGFuZCByZXR1cm4gYSBzdHJpbmcgd2l0aCBhIHNwZWNpZmllZCBlbmNvZGluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIFN0cmluZ1R5cGUge1xuICAgIGNvbnN0cnVjdG9yKGxlbiwgZW5jb2RpbmcpIHtcbiAgICAgICAgdGhpcy5sZW4gPSBsZW47XG4gICAgICAgIHRoaXMuZW5jb2RpbmcgPSBlbmNvZGluZztcbiAgICB9XG4gICAgZ2V0KHVpbnQ4QXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gQnVmZmVyLmZyb20odWludDhBcnJheSkudG9TdHJpbmcodGhpcy5lbmNvZGluZywgb2Zmc2V0LCBvZmZzZXQgKyB0aGlzLmxlbik7XG4gICAgfVxufVxuLyoqXG4gKiBBTlNJIExhdGluIDEgU3RyaW5nXG4gKiBVc2luZyB3aW5kb3dzLTEyNTIgLyBJU08gODg1OS0xIGRlY29kaW5nXG4gKi9cbmV4cG9ydCBjbGFzcyBBbnNpU3RyaW5nVHlwZSB7XG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICBzdGF0aWMgZGVjb2RlKGJ1ZmZlciwgb2Zmc2V0LCB1bnRpbCkge1xuICAgICAgICBsZXQgc3RyID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSBvZmZzZXQ7IGkgPCB1bnRpbDsgKytpKSB7XG4gICAgICAgICAgICBzdHIgKz0gQW5zaVN0cmluZ1R5cGUuY29kZVBvaW50VG9TdHJpbmcoQW5zaVN0cmluZ1R5cGUuc2luZ2xlQnl0ZURlY29kZXIoYnVmZmVyW2ldKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgc3RhdGljIGluUmFuZ2UoYSwgbWluLCBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1pbiA8PSBhICYmIGEgPD0gbWF4O1xuICAgIH1cbiAgICBzdGF0aWMgY29kZVBvaW50VG9TdHJpbmcoY3ApIHtcbiAgICAgICAgaWYgKGNwIDw9IDB4RkZGRikge1xuICAgICAgICAgICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoY3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY3AgLT0gMHgxMDAwMDtcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKChjcCA+PiAxMCkgKyAweEQ4MDAsIChjcCAmIDB4M0ZGKSArIDB4REMwMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIHNpbmdsZUJ5dGVEZWNvZGVyKGJpdGUpIHtcbiAgICAgICAgaWYgKEFuc2lTdHJpbmdUeXBlLmluUmFuZ2UoYml0ZSwgMHgwMCwgMHg3RikpIHtcbiAgICAgICAgICAgIHJldHVybiBiaXRlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvZGVQb2ludCA9IEFuc2lTdHJpbmdUeXBlLndpbmRvd3MxMjUyW2JpdGUgLSAweDgwXTtcbiAgICAgICAgaWYgKGNvZGVQb2ludCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2ludmFsaWRpbmcgZW5jb2RpbmcnKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29kZVBvaW50O1xuICAgIH1cbiAgICBnZXQoYnVmZmVyLCBvZmZzZXQgPSAwKSB7XG4gICAgICAgIHJldHVybiBBbnNpU3RyaW5nVHlwZS5kZWNvZGUoYnVmZmVyLCBvZmZzZXQsIG9mZnNldCArIHRoaXMubGVuKTtcbiAgICB9XG59XG5BbnNpU3RyaW5nVHlwZS53aW5kb3dzMTI1MiA9IFs4MzY0LCAxMjksIDgyMTgsIDQwMiwgODIyMiwgODIzMCwgODIyNCwgODIyNSwgNzEwLCA4MjQwLCAzNTIsXG4gICAgODI0OSwgMzM4LCAxNDEsIDM4MSwgMTQzLCAxNDQsIDgyMTYsIDgyMTcsIDgyMjAsIDgyMjEsIDgyMjYsIDgyMTEsIDgyMTIsIDczMixcbiAgICA4NDgyLCAzNTMsIDgyNTAsIDMzOSwgMTU3LCAzODIsIDM3NiwgMTYwLCAxNjEsIDE2MiwgMTYzLCAxNjQsIDE2NSwgMTY2LCAxNjcsIDE2OCxcbiAgICAxNjksIDE3MCwgMTcxLCAxNzIsIDE3MywgMTc0LCAxNzUsIDE3NiwgMTc3LCAxNzgsIDE3OSwgMTgwLCAxODEsIDE4MiwgMTgzLCAxODQsXG4gICAgMTg1LCAxODYsIDE4NywgMTg4LCAxODksIDE5MCwgMTkxLCAxOTIsIDE5MywgMTk0LCAxOTUsIDE5NiwgMTk3LCAxOTgsIDE5OSwgMjAwLFxuICAgIDIwMSwgMjAyLCAyMDMsIDIwNCwgMjA1LCAyMDYsIDIwNywgMjA4LCAyMDksIDIxMCwgMjExLCAyMTIsIDIxMywgMjE0LCAyMTUsIDIxNixcbiAgICAyMTcsIDIxOCwgMjE5LCAyMjAsIDIyMSwgMjIyLCAyMjMsIDIyNCwgMjI1LCAyMjYsIDIyNywgMjI4LCAyMjksIDIzMCwgMjMxLCAyMzIsXG4gICAgMjMzLCAyMzQsIDIzNSwgMjM2LCAyMzcsIDIzOCwgMjM5LCAyNDAsIDI0MSwgMjQyLCAyNDMsIDI0NCwgMjQ1LCAyNDYsIDI0NyxcbiAgICAyNDgsIDI0OSwgMjUwLCAyNTEsIDI1MiwgMjUzLCAyNTQsIDI1NV07XG4iLCJleHBvcnQgY29uc3QgZGVmYXVsdE1lc3NhZ2VzID0gJ0VuZC1PZi1TdHJlYW0nO1xuLyoqXG4gKiBUaHJvd24gb24gcmVhZCBvcGVyYXRpb24gb2YgdGhlIGVuZCBvZiBmaWxlIG9yIHN0cmVhbSBoYXMgYmVlbiByZWFjaGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBFbmRPZlN0cmVhbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcihkZWZhdWx0TWVzc2FnZXMpO1xuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBEZWZlcnJlZCB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMucmVzb2x2ZSA9ICgpID0+IG51bGw7XG4gICAgICAgIHRoaXMucmVqZWN0ID0gKCkgPT4gbnVsbDtcbiAgICAgICAgdGhpcy5wcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5yZWplY3QgPSByZWplY3Q7XG4gICAgICAgICAgICB0aGlzLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBFbmRPZlN0cmVhbUVycm9yIH0gZnJvbSBcIi4vRW5kT2ZTdHJlYW1FcnJvci5qc1wiO1xuZXhwb3J0IGNsYXNzIEFic3RyYWN0U3RyZWFtUmVhZGVyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIE1heGltdW0gcmVxdWVzdCBsZW5ndGggb24gcmVhZC1zdHJlYW0gb3BlcmF0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm1heFN0cmVhbVJlYWRTaXplID0gMSAqIDEwMjQgKiAxMDI0O1xuICAgICAgICB0aGlzLmVuZE9mU3RyZWFtID0gZmFsc2U7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9yZSBwZWVrZWQgZGF0YVxuICAgICAgICAgKiBAdHlwZSB7QXJyYXl9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnBlZWtRdWV1ZSA9IFtdO1xuICAgIH1cbiAgICBhc3luYyBwZWVrKHVpbnQ4QXJyYXksIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucmVhZCh1aW50OEFycmF5LCBvZmZzZXQsIGxlbmd0aCk7XG4gICAgICAgIHRoaXMucGVla1F1ZXVlLnB1c2godWludDhBcnJheS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIGJ5dGVzUmVhZCkpOyAvLyBQdXQgcmVhZCBkYXRhIGJhY2sgdG8gcGVlayBidWZmZXJcbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgYXN5bmMgcmVhZChidWZmZXIsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGlmIChsZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIGxldCBieXRlc1JlYWQgPSB0aGlzLnJlYWRGcm9tUGVla0J1ZmZlcihidWZmZXIsIG9mZnNldCwgbGVuZ3RoKTtcbiAgICAgICAgYnl0ZXNSZWFkICs9IGF3YWl0IHRoaXMucmVhZFJlbWFpbmRlckZyb21TdHJlYW0oYnVmZmVyLCBvZmZzZXQgKyBieXRlc1JlYWQsIGxlbmd0aCAtIGJ5dGVzUmVhZCk7XG4gICAgICAgIGlmIChieXRlc1JlYWQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBjaHVuayBmcm9tIHN0cmVhbVxuICAgICAqIEBwYXJhbSBidWZmZXIgLSBUYXJnZXQgVWludDhBcnJheSAob3IgQnVmZmVyKSB0byBzdG9yZSBkYXRhIHJlYWQgZnJvbSBzdHJlYW0gaW5cbiAgICAgKiBAcGFyYW0gb2Zmc2V0IC0gT2Zmc2V0IHRhcmdldFxuICAgICAqIEBwYXJhbSBsZW5ndGggLSBOdW1iZXIgb2YgYnl0ZXMgdG8gcmVhZFxuICAgICAqIEByZXR1cm5zIE51bWJlciBvZiBieXRlcyByZWFkXG4gICAgICovXG4gICAgcmVhZEZyb21QZWVrQnVmZmVyKGJ1ZmZlciwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgbGV0IHJlbWFpbmluZyA9IGxlbmd0aDtcbiAgICAgICAgbGV0IGJ5dGVzUmVhZCA9IDA7XG4gICAgICAgIC8vIGNvbnN1bWUgcGVla2VkIGRhdGEgZmlyc3RcbiAgICAgICAgd2hpbGUgKHRoaXMucGVla1F1ZXVlLmxlbmd0aCA+IDAgJiYgcmVtYWluaW5nID4gMCkge1xuICAgICAgICAgICAgY29uc3QgcGVla0RhdGEgPSB0aGlzLnBlZWtRdWV1ZS5wb3AoKTsgLy8gRnJvbnQgb2YgcXVldWVcbiAgICAgICAgICAgIGlmICghcGVla0RhdGEpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwZWVrRGF0YSBzaG91bGQgYmUgZGVmaW5lZCcpO1xuICAgICAgICAgICAgY29uc3QgbGVuQ29weSA9IE1hdGgubWluKHBlZWtEYXRhLmxlbmd0aCwgcmVtYWluaW5nKTtcbiAgICAgICAgICAgIGJ1ZmZlci5zZXQocGVla0RhdGEuc3ViYXJyYXkoMCwgbGVuQ29weSksIG9mZnNldCArIGJ5dGVzUmVhZCk7XG4gICAgICAgICAgICBieXRlc1JlYWQgKz0gbGVuQ29weTtcbiAgICAgICAgICAgIHJlbWFpbmluZyAtPSBsZW5Db3B5O1xuICAgICAgICAgICAgaWYgKGxlbkNvcHkgPCBwZWVrRGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAvLyByZW1haW5kZXIgYmFjayB0byBxdWV1ZVxuICAgICAgICAgICAgICAgIHRoaXMucGVla1F1ZXVlLnB1c2gocGVla0RhdGEuc3ViYXJyYXkobGVuQ29weSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBieXRlc1JlYWQ7XG4gICAgfVxuICAgIGFzeW5jIHJlYWRSZW1haW5kZXJGcm9tU3RyZWFtKGJ1ZmZlciwgb2Zmc2V0LCBpbml0aWFsUmVtYWluaW5nKSB7XG4gICAgICAgIGxldCByZW1haW5pbmcgPSBpbml0aWFsUmVtYWluaW5nO1xuICAgICAgICBsZXQgYnl0ZXNSZWFkID0gMDtcbiAgICAgICAgLy8gQ29udGludWUgcmVhZGluZyBmcm9tIHN0cmVhbSBpZiByZXF1aXJlZFxuICAgICAgICB3aGlsZSAocmVtYWluaW5nID4gMCAmJiAhdGhpcy5lbmRPZlN0cmVhbSkge1xuICAgICAgICAgICAgY29uc3QgcmVxTGVuID0gTWF0aC5taW4ocmVtYWluaW5nLCB0aGlzLm1heFN0cmVhbVJlYWRTaXplKTtcbiAgICAgICAgICAgIGNvbnN0IGNodW5rTGVuID0gYXdhaXQgdGhpcy5yZWFkRnJvbVN0cmVhbShidWZmZXIsIG9mZnNldCArIGJ5dGVzUmVhZCwgcmVxTGVuKTtcbiAgICAgICAgICAgIGlmIChjaHVua0xlbiA9PT0gMClcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGJ5dGVzUmVhZCArPSBjaHVua0xlbjtcbiAgICAgICAgICAgIHJlbWFpbmluZyAtPSBjaHVua0xlbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICcuL0VuZE9mU3RyZWFtRXJyb3IuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWQgfSBmcm9tICcuL0RlZmVycmVkLmpzJztcbmltcG9ydCB7IEFic3RyYWN0U3RyZWFtUmVhZGVyIH0gZnJvbSBcIi4vQWJzdHJhY3RTdHJlYW1SZWFkZXIuanNcIjtcbmV4cG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICcuL0VuZE9mU3RyZWFtRXJyb3IuanMnO1xuLyoqXG4gKiBOb2RlLmpzIFJlYWRhYmxlIFN0cmVhbSBSZWFkZXJcbiAqIFJlZjogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9zdHJlYW0uaHRtbCNyZWFkYWJsZS1zdHJlYW1zXG4gKi9cbmV4cG9ydCBjbGFzcyBTdHJlYW1SZWFkZXIgZXh0ZW5kcyBBYnN0cmFjdFN0cmVhbVJlYWRlciB7XG4gICAgY29uc3RydWN0b3Iocykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLnMgPSBzO1xuICAgICAgICAvKipcbiAgICAgICAgICogRGVmZXJyZWQgdXNlZCBmb3IgcG9zdHBvbmVkIHJlYWQgcmVxdWVzdCAoYXMgbm90IGRhdGEgaXMgeWV0IGF2YWlsYWJsZSB0byByZWFkKVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5kZWZlcnJlZCA9IG51bGw7XG4gICAgICAgIGlmICghcy5yZWFkIHx8ICFzLm9uY2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgYW4gaW5zdGFuY2Ugb2Ygc3RyZWFtLlJlYWRhYmxlJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zLm9uY2UoJ2VuZCcsICgpID0+IHRoaXMucmVqZWN0KG5ldyBFbmRPZlN0cmVhbUVycm9yKCkpKTtcbiAgICAgICAgdGhpcy5zLm9uY2UoJ2Vycm9yJywgZXJyID0+IHRoaXMucmVqZWN0KGVycikpO1xuICAgICAgICB0aGlzLnMub25jZSgnY2xvc2UnLCAoKSA9PiB0aGlzLnJlamVjdChuZXcgRXJyb3IoJ1N0cmVhbSBjbG9zZWQnKSkpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGNodW5rIGZyb20gc3RyZWFtXG4gICAgICogQHBhcmFtIGJ1ZmZlciBUYXJnZXQgVWludDhBcnJheSAob3IgQnVmZmVyKSB0byBzdG9yZSBkYXRhIHJlYWQgZnJvbSBzdHJlYW0gaW5cbiAgICAgKiBAcGFyYW0gb2Zmc2V0IE9mZnNldCB0YXJnZXRcbiAgICAgKiBAcGFyYW0gbGVuZ3RoIE51bWJlciBvZiBieXRlcyB0byByZWFkXG4gICAgICogQHJldHVybnMgTnVtYmVyIG9mIGJ5dGVzIHJlYWRcbiAgICAgKi9cbiAgICBhc3luYyByZWFkRnJvbVN0cmVhbShidWZmZXIsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGlmICh0aGlzLmVuZE9mU3RyZWFtKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWFkQnVmZmVyID0gdGhpcy5zLnJlYWQobGVuZ3RoKTtcbiAgICAgICAgaWYgKHJlYWRCdWZmZXIpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5zZXQocmVhZEJ1ZmZlciwgb2Zmc2V0KTtcbiAgICAgICAgICAgIHJldHVybiByZWFkQnVmZmVyLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgb2Zmc2V0LFxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZCgpXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZGVmZXJyZWQgPSByZXF1ZXN0LmRlZmVycmVkO1xuICAgICAgICB0aGlzLnMub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnJlYWREZWZlcnJlZChyZXF1ZXN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFByb2Nlc3MgZGVmZXJyZWQgcmVhZCByZXF1ZXN0XG4gICAgICogQHBhcmFtIHJlcXVlc3QgRGVmZXJyZWQgcmVhZCByZXF1ZXN0XG4gICAgICovXG4gICAgcmVhZERlZmVycmVkKHJlcXVlc3QpIHtcbiAgICAgICAgY29uc3QgcmVhZEJ1ZmZlciA9IHRoaXMucy5yZWFkKHJlcXVlc3QubGVuZ3RoKTtcbiAgICAgICAgaWYgKHJlYWRCdWZmZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QuYnVmZmVyLnNldChyZWFkQnVmZmVyLCByZXF1ZXN0Lm9mZnNldCk7XG4gICAgICAgICAgICByZXF1ZXN0LmRlZmVycmVkLnJlc29sdmUocmVhZEJ1ZmZlci5sZW5ndGgpO1xuICAgICAgICAgICAgdGhpcy5kZWZlcnJlZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnMub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZWFkRGVmZXJyZWQocmVxdWVzdCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZWplY3QoZXJyKSB7XG4gICAgICAgIHRoaXMuZW5kT2ZTdHJlYW0gPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5kZWZlcnJlZCkge1xuICAgICAgICAgICAgdGhpcy5kZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIHRoaXMuZGVmZXJyZWQgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGFzeW5jIGFib3J0KCkge1xuICAgICAgICB0aGlzLnMuZGVzdHJveSgpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbi8qKlxuICogQ29yZSB0b2tlbml6ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEFic3RyYWN0VG9rZW5pemVyIHtcbiAgICBjb25zdHJ1Y3RvcihmaWxlSW5mbykge1xuICAgICAgICAvKipcbiAgICAgICAgICogVG9rZW5pemVyLXN0cmVhbSBwb3NpdGlvblxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IDA7XG4gICAgICAgIHRoaXMubnVtQnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoOCk7XG4gICAgICAgIHRoaXMuZmlsZUluZm8gPSBmaWxlSW5mbyA/IGZpbGVJbmZvIDoge307XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSB0b2tlbiBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtXG4gICAgICogQHBhcmFtIHRva2VuIC0gVGhlIHRva2VuIHRvIHJlYWRcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gLSBJZiBwcm92aWRlZCwgdGhlIGRlc2lyZWQgcG9zaXRpb24gaW4gdGhlIHRva2VuaXplci1zdHJlYW1cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggdG9rZW4gZGF0YVxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRUb2tlbih0b2tlbiwgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgIGNvbnN0IHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheSh0b2tlbi5sZW4pO1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnJlYWRCdWZmZXIodWludDhBcnJheSwgeyBwb3NpdGlvbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodWludDhBcnJheSwgMCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFBlZWsgYSB0b2tlbiBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtLlxuICAgICAqIEBwYXJhbSB0b2tlbiAtIFRva2VuIHRvIHBlZWsgZnJvbSB0aGUgdG9rZW5pemVyLXN0cmVhbS5cbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gLSBPZmZzZXQgd2hlcmUgdG8gYmVnaW4gcmVhZGluZyB3aXRoaW4gdGhlIGZpbGUuIElmIHBvc2l0aW9uIGlzIG51bGwsIGRhdGEgd2lsbCBiZSByZWFkIGZyb20gdGhlIGN1cnJlbnQgZmlsZSBwb3NpdGlvbi5cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggdG9rZW4gZGF0YVxuICAgICAqL1xuICAgIGFzeW5jIHBlZWtUb2tlbih0b2tlbiwgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgIGNvbnN0IHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheSh0b2tlbi5sZW4pO1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnBlZWtCdWZmZXIodWludDhBcnJheSwgeyBwb3NpdGlvbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodWludDhBcnJheSwgMCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBudW1lcmljIHRva2VuIGZyb20gdGhlIHN0cmVhbVxuICAgICAqIEBwYXJhbSB0b2tlbiAtIE51bWVyaWMgdG9rZW5cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggbnVtYmVyXG4gICAgICovXG4gICAgYXN5bmMgcmVhZE51bWJlcih0b2tlbikge1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnJlYWRCdWZmZXIodGhpcy5udW1CdWZmZXIsIHsgbGVuZ3RoOiB0b2tlbi5sZW4gfSk7XG4gICAgICAgIGlmIChsZW4gPCB0b2tlbi5sZW4pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRW5kT2ZTdHJlYW1FcnJvcigpO1xuICAgICAgICByZXR1cm4gdG9rZW4uZ2V0KHRoaXMubnVtQnVmZmVyLCAwKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIG51bWVyaWMgdG9rZW4gZnJvbSB0aGUgc3RyZWFtXG4gICAgICogQHBhcmFtIHRva2VuIC0gTnVtZXJpYyB0b2tlblxuICAgICAqIEByZXR1cm5zIFByb21pc2Ugd2l0aCBudW1iZXJcbiAgICAgKi9cbiAgICBhc3luYyBwZWVrTnVtYmVyKHRva2VuKSB7XG4gICAgICAgIGNvbnN0IGxlbiA9IGF3YWl0IHRoaXMucGVla0J1ZmZlcih0aGlzLm51bUJ1ZmZlciwgeyBsZW5ndGg6IHRva2VuLmxlbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodGhpcy5udW1CdWZmZXIsIDApO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJZ25vcmUgbnVtYmVyIG9mIGJ5dGVzLCBhZHZhbmNlcyB0aGUgcG9pbnRlciBpbiB1bmRlciB0b2tlbml6ZXItc3RyZWFtLlxuICAgICAqIEBwYXJhbSBsZW5ndGggLSBOdW1iZXIgb2YgYnl0ZXMgdG8gaWdub3JlXG4gICAgICogQHJldHVybiByZXNvbHZlcyB0aGUgbnVtYmVyIG9mIGJ5dGVzIGlnbm9yZWQsIGVxdWFscyBsZW5ndGggaWYgdGhpcyBhdmFpbGFibGUsIG90aGVyd2lzZSB0aGUgbnVtYmVyIG9mIGJ5dGVzIGF2YWlsYWJsZVxuICAgICAqL1xuICAgIGFzeW5jIGlnbm9yZShsZW5ndGgpIHtcbiAgICAgICAgaWYgKHRoaXMuZmlsZUluZm8uc2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBieXRlc0xlZnQgPSB0aGlzLmZpbGVJbmZvLnNpemUgLSB0aGlzLnBvc2l0aW9uO1xuICAgICAgICAgICAgaWYgKGxlbmd0aCA+IGJ5dGVzTGVmdCkge1xuICAgICAgICAgICAgICAgIHRoaXMucG9zaXRpb24gKz0gYnl0ZXNMZWZ0O1xuICAgICAgICAgICAgICAgIHJldHVybiBieXRlc0xlZnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb3NpdGlvbiArPSBsZW5ndGg7XG4gICAgICAgIHJldHVybiBsZW5ndGg7XG4gICAgfVxuICAgIGFzeW5jIGNsb3NlKCkge1xuICAgICAgICAvLyBlbXB0eVxuICAgIH1cbiAgICBub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wb3NpdGlvbiAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMucG9zaXRpb24gPCB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG1heUJlTGVzczogb3B0aW9ucy5tYXlCZUxlc3MgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCA/IG9wdGlvbnMub2Zmc2V0IDogMCxcbiAgICAgICAgICAgICAgICBsZW5ndGg6IG9wdGlvbnMubGVuZ3RoID8gb3B0aW9ucy5sZW5ndGggOiAodWludDhBcnJheS5sZW5ndGggLSAob3B0aW9ucy5vZmZzZXQgPyBvcHRpb25zLm9mZnNldCA6IDApKSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogb3B0aW9ucy5wb3NpdGlvbiA/IG9wdGlvbnMucG9zaXRpb24gOiB0aGlzLnBvc2l0aW9uXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtYXlCZUxlc3M6IGZhbHNlLFxuICAgICAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICAgICAgbGVuZ3RoOiB1aW50OEFycmF5Lmxlbmd0aCxcbiAgICAgICAgICAgIHBvc2l0aW9uOiB0aGlzLnBvc2l0aW9uXG4gICAgICAgIH07XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgQWJzdHJhY3RUb2tlbml6ZXIgfSBmcm9tICcuL0Fic3RyYWN0VG9rZW5pemVyLmpzJztcbmltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbmNvbnN0IG1heEJ1ZmZlclNpemUgPSAyNTYwMDA7XG5leHBvcnQgY2xhc3MgUmVhZFN0cmVhbVRva2VuaXplciBleHRlbmRzIEFic3RyYWN0VG9rZW5pemVyIHtcbiAgICBjb25zdHJ1Y3RvcihzdHJlYW1SZWFkZXIsIGZpbGVJbmZvKSB7XG4gICAgICAgIHN1cGVyKGZpbGVJbmZvKTtcbiAgICAgICAgdGhpcy5zdHJlYW1SZWFkZXIgPSBzdHJlYW1SZWFkZXI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdldCBmaWxlIGluZm9ybWF0aW9uLCBhbiBIVFRQLWNsaWVudCBtYXkgaW1wbGVtZW50IHRoaXMgZG9pbmcgYSBIRUFEIHJlcXVlc3RcbiAgICAgKiBAcmV0dXJuIFByb21pc2Ugd2l0aCBmaWxlIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgYXN5bmMgZ2V0RmlsZUluZm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZpbGVJbmZvO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGJ1ZmZlciBmcm9tIHRva2VuaXplclxuICAgICAqIEBwYXJhbSB1aW50OEFycmF5IC0gVGFyZ2V0IFVpbnQ4QXJyYXkgdG8gZmlsbCB3aXRoIGRhdGEgcmVhZCBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtXG4gICAgICogQHBhcmFtIG9wdGlvbnMgLSBSZWFkIGJlaGF2aW91ciBvcHRpb25zXG4gICAgICogQHJldHVybnMgUHJvbWlzZSB3aXRoIG51bWJlciBvZiBieXRlcyByZWFkXG4gICAgICovXG4gICAgYXN5bmMgcmVhZEJ1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1PcHRpb25zID0gdGhpcy5ub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICBjb25zdCBza2lwQnl0ZXMgPSBub3JtT3B0aW9ucy5wb3NpdGlvbiAtIHRoaXMucG9zaXRpb247XG4gICAgICAgIGlmIChza2lwQnl0ZXMgPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmlnbm9yZShza2lwQnl0ZXMpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVhZEJ1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChza2lwQnl0ZXMgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub3JtT3B0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMuc3RyZWFtUmVhZGVyLnJlYWQodWludDhBcnJheSwgbm9ybU9wdGlvbnMub2Zmc2V0LCBub3JtT3B0aW9ucy5sZW5ndGgpO1xuICAgICAgICB0aGlzLnBvc2l0aW9uICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgaWYgKCghb3B0aW9ucyB8fCAhb3B0aW9ucy5tYXlCZUxlc3MpICYmIGJ5dGVzUmVhZCA8IG5vcm1PcHRpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVuZE9mU3RyZWFtRXJyb3IoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBQZWVrIChyZWFkIGFoZWFkKSBidWZmZXIgZnJvbSB0b2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgKG9yIEJ1ZmZlcikgdG8gd3JpdGUgZGF0YSB0b1xuICAgICAqIEBwYXJhbSBvcHRpb25zIC0gUmVhZCBiZWhhdmlvdXIgb3B0aW9uc1xuICAgICAqIEByZXR1cm5zIFByb21pc2Ugd2l0aCBudW1iZXIgb2YgYnl0ZXMgcGVla2VkXG4gICAgICovXG4gICAgYXN5bmMgcGVla0J1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1PcHRpb25zID0gdGhpcy5ub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICBsZXQgYnl0ZXNSZWFkID0gMDtcbiAgICAgICAgaWYgKG5vcm1PcHRpb25zLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBza2lwQnl0ZXMgPSBub3JtT3B0aW9ucy5wb3NpdGlvbiAtIHRoaXMucG9zaXRpb247XG4gICAgICAgICAgICBpZiAoc2tpcEJ5dGVzID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNraXBCdWZmZXIgPSBuZXcgVWludDhBcnJheShub3JtT3B0aW9ucy5sZW5ndGggKyBza2lwQnl0ZXMpO1xuICAgICAgICAgICAgICAgIGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucGVla0J1ZmZlcihza2lwQnVmZmVyLCB7IG1heUJlTGVzczogbm9ybU9wdGlvbnMubWF5QmVMZXNzIH0pO1xuICAgICAgICAgICAgICAgIHVpbnQ4QXJyYXkuc2V0KHNraXBCdWZmZXIuc3ViYXJyYXkoc2tpcEJ5dGVzKSwgbm9ybU9wdGlvbnMub2Zmc2V0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnl0ZXNSZWFkIC0gc2tpcEJ5dGVzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2tpcEJ5dGVzIDwgMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHBlZWsgZnJvbSBhIG5lZ2F0aXZlIG9mZnNldCBpbiBhIHN0cmVhbScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChub3JtT3B0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMuc3RyZWFtUmVhZGVyLnBlZWsodWludDhBcnJheSwgbm9ybU9wdGlvbnMub2Zmc2V0LCBub3JtT3B0aW9ucy5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMubWF5QmVMZXNzICYmIGVyciBpbnN0YW5jZW9mIEVuZE9mU3RyZWFtRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgoIW5vcm1PcHRpb25zLm1heUJlTGVzcykgJiYgYnl0ZXNSZWFkIDwgbm9ybU9wdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVuZE9mU3RyZWFtRXJyb3IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbiAgICBhc3luYyBpZ25vcmUobGVuZ3RoKSB7XG4gICAgICAgIC8vIGRlYnVnKGBpZ25vcmUgJHt0aGlzLnBvc2l0aW9ufS4uLiR7dGhpcy5wb3NpdGlvbiArIGxlbmd0aCAtIDF9YCk7XG4gICAgICAgIGNvbnN0IGJ1ZlNpemUgPSBNYXRoLm1pbihtYXhCdWZmZXJTaXplLCBsZW5ndGgpO1xuICAgICAgICBjb25zdCBidWYgPSBuZXcgVWludDhBcnJheShidWZTaXplKTtcbiAgICAgICAgbGV0IHRvdEJ5dGVzUmVhZCA9IDA7XG4gICAgICAgIHdoaWxlICh0b3RCeXRlc1JlYWQgPCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IGxlbmd0aCAtIHRvdEJ5dGVzUmVhZDtcbiAgICAgICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucmVhZEJ1ZmZlcihidWYsIHsgbGVuZ3RoOiBNYXRoLm1pbihidWZTaXplLCByZW1haW5pbmcpIH0pO1xuICAgICAgICAgICAgaWYgKGJ5dGVzUmVhZCA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG90Qnl0ZXNSZWFkICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdG90Qnl0ZXNSZWFkO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbmltcG9ydCB7IEFic3RyYWN0VG9rZW5pemVyIH0gZnJvbSAnLi9BYnN0cmFjdFRva2VuaXplci5qcyc7XG5leHBvcnQgY2xhc3MgQnVmZmVyVG9rZW5pemVyIGV4dGVuZHMgQWJzdHJhY3RUb2tlbml6ZXIge1xuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdCBCdWZmZXJUb2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAgICAgKiBAcGFyYW0gZmlsZUluZm8gLSBQYXNzIGFkZGl0aW9uYWwgZmlsZSBpbmZvcm1hdGlvbiB0byB0aGUgdG9rZW5pemVyXG4gICAgICovXG4gICAgY29uc3RydWN0b3IodWludDhBcnJheSwgZmlsZUluZm8pIHtcbiAgICAgICAgc3VwZXIoZmlsZUluZm8pO1xuICAgICAgICB0aGlzLnVpbnQ4QXJyYXkgPSB1aW50OEFycmF5O1xuICAgICAgICB0aGlzLmZpbGVJbmZvLnNpemUgPSB0aGlzLmZpbGVJbmZvLnNpemUgPyB0aGlzLmZpbGVJbmZvLnNpemUgOiB1aW50OEFycmF5Lmxlbmd0aDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBidWZmZXIgZnJvbSB0b2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyAtIFJlYWQgYmVoYXZpb3VyIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRCdWZmZXIodWludDhBcnJheSwgb3B0aW9ucykge1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5wb3NpdGlvbiA8IHRoaXMucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb247XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYnl0ZXNSZWFkID0gYXdhaXQgdGhpcy5wZWVrQnVmZmVyKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICB0aGlzLnBvc2l0aW9uICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUGVlayAocmVhZCBhaGVhZCkgYnVmZmVyIGZyb20gdG9rZW5pemVyXG4gICAgICogQHBhcmFtIHVpbnQ4QXJyYXlcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyAtIFJlYWQgYmVoYXZpb3VyIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgICAqL1xuICAgIGFzeW5jIHBlZWtCdWZmZXIodWludDhBcnJheSwgb3B0aW9ucykge1xuICAgICAgICBjb25zdCBub3JtT3B0aW9ucyA9IHRoaXMubm9ybWFsaXplT3B0aW9ucyh1aW50OEFycmF5LCBvcHRpb25zKTtcbiAgICAgICAgY29uc3QgYnl0ZXMycmVhZCA9IE1hdGgubWluKHRoaXMudWludDhBcnJheS5sZW5ndGggLSBub3JtT3B0aW9ucy5wb3NpdGlvbiwgbm9ybU9wdGlvbnMubGVuZ3RoKTtcbiAgICAgICAgaWYgKCghbm9ybU9wdGlvbnMubWF5QmVMZXNzKSAmJiBieXRlczJyZWFkIDwgbm9ybU9wdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRW5kT2ZTdHJlYW1FcnJvcigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdWludDhBcnJheS5zZXQodGhpcy51aW50OEFycmF5LnN1YmFycmF5KG5vcm1PcHRpb25zLnBvc2l0aW9uLCBub3JtT3B0aW9ucy5wb3NpdGlvbiArIGJ5dGVzMnJlYWQpLCBub3JtT3B0aW9ucy5vZmZzZXQpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5dGVzMnJlYWQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYXN5bmMgY2xvc2UoKSB7XG4gICAgICAgIC8vIGVtcHR5XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgUmVhZFN0cmVhbVRva2VuaXplciB9IGZyb20gJy4vUmVhZFN0cmVhbVRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBCdWZmZXJUb2tlbml6ZXIgfSBmcm9tICcuL0J1ZmZlclRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBTdHJlYW1SZWFkZXIsIFdlYlN0cmVhbVJlYWRlciB9IGZyb20gJ3BlZWstcmVhZGFibGUnO1xuZXhwb3J0IHsgRW5kT2ZTdHJlYW1FcnJvciB9IGZyb20gJ3BlZWstcmVhZGFibGUnO1xuLyoqXG4gKiBDb25zdHJ1Y3QgUmVhZFN0cmVhbVRva2VuaXplciBmcm9tIGdpdmVuIFN0cmVhbS5cbiAqIFdpbGwgc2V0IGZpbGVTaXplLCBpZiBwcm92aWRlZCBnaXZlbiBTdHJlYW0gaGFzIHNldCB0aGUgLnBhdGggcHJvcGVydHkvXG4gKiBAcGFyYW0gc3RyZWFtIC0gUmVhZCBmcm9tIE5vZGUuanMgU3RyZWFtLlJlYWRhYmxlXG4gKiBAcGFyYW0gZmlsZUluZm8gLSBQYXNzIHRoZSBmaWxlIGluZm9ybWF0aW9uLCBsaWtlIHNpemUgYW5kIE1JTUUtdHlwZSBvZiB0aGUgY29ycmVzcG9uZGluZyBzdHJlYW0uXG4gKiBAcmV0dXJucyBSZWFkU3RyZWFtVG9rZW5pemVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyZWFtKHN0cmVhbSwgZmlsZUluZm8pIHtcbiAgICBmaWxlSW5mbyA9IGZpbGVJbmZvID8gZmlsZUluZm8gOiB7fTtcbiAgICByZXR1cm4gbmV3IFJlYWRTdHJlYW1Ub2tlbml6ZXIobmV3IFN0cmVhbVJlYWRlcihzdHJlYW0pLCBmaWxlSW5mbyk7XG59XG4vKipcbiAqIENvbnN0cnVjdCBSZWFkU3RyZWFtVG9rZW5pemVyIGZyb20gZ2l2ZW4gUmVhZGFibGVTdHJlYW0gKFdlYlN0cmVhbSBBUEkpLlxuICogV2lsbCBzZXQgZmlsZVNpemUsIGlmIHByb3ZpZGVkIGdpdmVuIFN0cmVhbSBoYXMgc2V0IHRoZSAucGF0aCBwcm9wZXJ0eS9cbiAqIEBwYXJhbSB3ZWJTdHJlYW0gLSBSZWFkIGZyb20gTm9kZS5qcyBTdHJlYW0uUmVhZGFibGVcbiAqIEBwYXJhbSBmaWxlSW5mbyAtIFBhc3MgdGhlIGZpbGUgaW5mb3JtYXRpb24sIGxpa2Ugc2l6ZSBhbmQgTUlNRS10eXBlIG9mIHRoZSBjb3JyZXNwb25kaW5nIHN0cmVhbS5cbiAqIEByZXR1cm5zIFJlYWRTdHJlYW1Ub2tlbml6ZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21XZWJTdHJlYW0od2ViU3RyZWFtLCBmaWxlSW5mbykge1xuICAgIGZpbGVJbmZvID0gZmlsZUluZm8gPyBmaWxlSW5mbyA6IHt9O1xuICAgIHJldHVybiBuZXcgUmVhZFN0cmVhbVRva2VuaXplcihuZXcgV2ViU3RyZWFtUmVhZGVyKHdlYlN0cmVhbSksIGZpbGVJbmZvKTtcbn1cbi8qKlxuICogQ29uc3RydWN0IFJlYWRTdHJlYW1Ub2tlbml6ZXIgZnJvbSBnaXZlbiBCdWZmZXIuXG4gKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAqIEBwYXJhbSBmaWxlSW5mbyAtIFBhc3MgYWRkaXRpb25hbCBmaWxlIGluZm9ybWF0aW9uIHRvIHRoZSB0b2tlbml6ZXJcbiAqIEByZXR1cm5zIEJ1ZmZlclRva2VuaXplclxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUJ1ZmZlcih1aW50OEFycmF5LCBmaWxlSW5mbykge1xuICAgIHJldHVybiBuZXcgQnVmZmVyVG9rZW5pemVyKHVpbnQ4QXJyYXksIGZpbGVJbmZvKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBzdHJpbmdUb0J5dGVzKHN0cmluZykge1xuXHRyZXR1cm4gWy4uLnN0cmluZ10ubWFwKGNoYXJhY3RlciA9PiBjaGFyYWN0ZXIuY2hhckNvZGVBdCgwKSk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgdW5pY29ybi9wcmVmZXItY29kZS1wb2ludFxufVxuXG4vKipcbkNoZWNrcyB3aGV0aGVyIHRoZSBUQVIgY2hlY2tzdW0gaXMgdmFsaWQuXG5cbkBwYXJhbSB7QnVmZmVyfSBidWZmZXIgLSBUaGUgVEFSIGhlYWRlciBgW29mZnNldCAuLi4gb2Zmc2V0ICsgNTEyXWAuXG5AcGFyYW0ge251bWJlcn0gb2Zmc2V0IC0gVEFSIGhlYWRlciBvZmZzZXQuXG5AcmV0dXJucyB7Ym9vbGVhbn0gYHRydWVgIGlmIHRoZSBUQVIgY2hlY2tzdW0gaXMgdmFsaWQsIG90aGVyd2lzZSBgZmFsc2VgLlxuKi9cbmV4cG9ydCBmdW5jdGlvbiB0YXJIZWFkZXJDaGVja3N1bU1hdGNoZXMoYnVmZmVyLCBvZmZzZXQgPSAwKSB7XG5cdGNvbnN0IHJlYWRTdW0gPSBOdW1iZXIucGFyc2VJbnQoYnVmZmVyLnRvU3RyaW5nKCd1dGY4JywgMTQ4LCAxNTQpLnJlcGxhY2UoL1xcMC4qJC8sICcnKS50cmltKCksIDgpOyAvLyBSZWFkIHN1bSBpbiBoZWFkZXJcblx0aWYgKE51bWJlci5pc05hTihyZWFkU3VtKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGxldCBzdW0gPSA4ICogMHgyMDsgLy8gSW5pdGlhbGl6ZSBzaWduZWQgYml0IHN1bVxuXG5cdGZvciAobGV0IGluZGV4ID0gb2Zmc2V0OyBpbmRleCA8IG9mZnNldCArIDE0ODsgaW5kZXgrKykge1xuXHRcdHN1bSArPSBidWZmZXJbaW5kZXhdO1xuXHR9XG5cblx0Zm9yIChsZXQgaW5kZXggPSBvZmZzZXQgKyAxNTY7IGluZGV4IDwgb2Zmc2V0ICsgNTEyOyBpbmRleCsrKSB7XG5cdFx0c3VtICs9IGJ1ZmZlcltpbmRleF07XG5cdH1cblxuXHRyZXR1cm4gcmVhZFN1bSA9PT0gc3VtO1xufVxuXG4vKipcbklEMyBVSU5UMzIgc3luYy1zYWZlIHRva2VuaXplciB0b2tlbi5cbjI4IGJpdHMgKHJlcHJlc2VudGluZyB1cCB0byAyNTZNQikgaW50ZWdlciwgdGhlIG1zYiBpcyAwIHRvIGF2b2lkIFwiZmFsc2Ugc3luY3NpZ25hbHNcIi5cbiovXG5leHBvcnQgY29uc3QgdWludDMyU3luY1NhZmVUb2tlbiA9IHtcblx0Z2V0OiAoYnVmZmVyLCBvZmZzZXQpID0+IChidWZmZXJbb2Zmc2V0ICsgM10gJiAweDdGKSB8ICgoYnVmZmVyW29mZnNldCArIDJdKSA8PCA3KSB8ICgoYnVmZmVyW29mZnNldCArIDFdKSA8PCAxNCkgfCAoKGJ1ZmZlcltvZmZzZXRdKSA8PCAyMSksXG5cdGxlbjogNCxcbn07XG4iLCJleHBvcnQgY29uc3QgZXh0ZW5zaW9ucyA9IFtcblx0J2pwZycsXG5cdCdwbmcnLFxuXHQnYXBuZycsXG5cdCdnaWYnLFxuXHQnd2VicCcsXG5cdCdmbGlmJyxcblx0J3hjZicsXG5cdCdjcjInLFxuXHQnY3IzJyxcblx0J29yZicsXG5cdCdhcncnLFxuXHQnZG5nJyxcblx0J25lZicsXG5cdCdydzInLFxuXHQncmFmJyxcblx0J3RpZicsXG5cdCdibXAnLFxuXHQnaWNucycsXG5cdCdqeHInLFxuXHQncHNkJyxcblx0J2luZGQnLFxuXHQnemlwJyxcblx0J3RhcicsXG5cdCdyYXInLFxuXHQnZ3onLFxuXHQnYnoyJyxcblx0Jzd6Jyxcblx0J2RtZycsXG5cdCdtcDQnLFxuXHQnbWlkJyxcblx0J21rdicsXG5cdCd3ZWJtJyxcblx0J21vdicsXG5cdCdhdmknLFxuXHQnbXBnJyxcblx0J21wMicsXG5cdCdtcDMnLFxuXHQnbTRhJyxcblx0J29nYScsXG5cdCdvZ2cnLFxuXHQnb2d2Jyxcblx0J29wdXMnLFxuXHQnZmxhYycsXG5cdCd3YXYnLFxuXHQnc3B4Jyxcblx0J2FtcicsXG5cdCdwZGYnLFxuXHQnZXB1YicsXG5cdCdlbGYnLFxuXHQnbWFjaG8nLFxuXHQnZXhlJyxcblx0J3N3ZicsXG5cdCdydGYnLFxuXHQnd2FzbScsXG5cdCd3b2ZmJyxcblx0J3dvZmYyJyxcblx0J2VvdCcsXG5cdCd0dGYnLFxuXHQnb3RmJyxcblx0J2ljbycsXG5cdCdmbHYnLFxuXHQncHMnLFxuXHQneHonLFxuXHQnc3FsaXRlJyxcblx0J25lcycsXG5cdCdjcngnLFxuXHQneHBpJyxcblx0J2NhYicsXG5cdCdkZWInLFxuXHQnYXInLFxuXHQncnBtJyxcblx0J1onLFxuXHQnbHonLFxuXHQnY2ZiJyxcblx0J214ZicsXG5cdCdtdHMnLFxuXHQnYmxlbmQnLFxuXHQnYnBnJyxcblx0J2RvY3gnLFxuXHQncHB0eCcsXG5cdCd4bHN4Jyxcblx0JzNncCcsXG5cdCczZzInLFxuXHQnajJjJyxcblx0J2pwMicsXG5cdCdqcG0nLFxuXHQnanB4Jyxcblx0J21qMicsXG5cdCdhaWYnLFxuXHQncWNwJyxcblx0J29kdCcsXG5cdCdvZHMnLFxuXHQnb2RwJyxcblx0J3htbCcsXG5cdCdtb2JpJyxcblx0J2hlaWMnLFxuXHQnY3VyJyxcblx0J2t0eCcsXG5cdCdhcGUnLFxuXHQnd3YnLFxuXHQnZGNtJyxcblx0J2ljcycsXG5cdCdnbGInLFxuXHQncGNhcCcsXG5cdCdkc2YnLFxuXHQnbG5rJyxcblx0J2FsaWFzJyxcblx0J3ZvYycsXG5cdCdhYzMnLFxuXHQnbTR2Jyxcblx0J200cCcsXG5cdCdtNGInLFxuXHQnZjR2Jyxcblx0J2Y0cCcsXG5cdCdmNGInLFxuXHQnZjRhJyxcblx0J21pZScsXG5cdCdhc2YnLFxuXHQnb2dtJyxcblx0J29neCcsXG5cdCdtcGMnLFxuXHQnYXJyb3cnLFxuXHQnc2hwJyxcblx0J2FhYycsXG5cdCdtcDEnLFxuXHQnaXQnLFxuXHQnczNtJyxcblx0J3htJyxcblx0J2FpJyxcblx0J3NrcCcsXG5cdCdhdmlmJyxcblx0J2VwcycsXG5cdCdsemgnLFxuXHQncGdwJyxcblx0J2FzYXInLFxuXHQnc3RsJyxcblx0J2NobScsXG5cdCczbWYnLFxuXHQnenN0Jyxcblx0J2p4bCcsXG5cdCd2Y2YnLFxuXHQnamxzJyxcblx0J3BzdCcsXG5cdCdkd2cnLFxuXHQncGFycXVldCcsXG5cdCdjbGFzcycsXG5cdCdhcmonLFxuXHQnY3BpbycsXG5cdCdhY2UnLFxuXHQnYXZybycsXG5cdCdpY2MnLFxuXHQnZmJ4Jyxcbl07XG5cbmV4cG9ydCBjb25zdCBtaW1lVHlwZXMgPSBbXG5cdCdpbWFnZS9qcGVnJyxcblx0J2ltYWdlL3BuZycsXG5cdCdpbWFnZS9naWYnLFxuXHQnaW1hZ2Uvd2VicCcsXG5cdCdpbWFnZS9mbGlmJyxcblx0J2ltYWdlL3gteGNmJyxcblx0J2ltYWdlL3gtY2Fub24tY3IyJyxcblx0J2ltYWdlL3gtY2Fub24tY3IzJyxcblx0J2ltYWdlL3RpZmYnLFxuXHQnaW1hZ2UvYm1wJyxcblx0J2ltYWdlL3ZuZC5tcy1waG90bycsXG5cdCdpbWFnZS92bmQuYWRvYmUucGhvdG9zaG9wJyxcblx0J2FwcGxpY2F0aW9uL3gtaW5kZXNpZ24nLFxuXHQnYXBwbGljYXRpb24vZXB1Yit6aXAnLFxuXHQnYXBwbGljYXRpb24veC14cGluc3RhbGwnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC50ZXh0Jyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQuc3ByZWFkc2hlZXQnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5wcmVzZW50YXRpb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnByZXNlbnRhdGlvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldCcsXG5cdCdhcHBsaWNhdGlvbi96aXAnLFxuXHQnYXBwbGljYXRpb24veC10YXInLFxuXHQnYXBwbGljYXRpb24veC1yYXItY29tcHJlc3NlZCcsXG5cdCdhcHBsaWNhdGlvbi9nemlwJyxcblx0J2FwcGxpY2F0aW9uL3gtYnppcDInLFxuXHQnYXBwbGljYXRpb24veC03ei1jb21wcmVzc2VkJyxcblx0J2FwcGxpY2F0aW9uL3gtYXBwbGUtZGlza2ltYWdlJyxcblx0J2FwcGxpY2F0aW9uL3gtYXBhY2hlLWFycm93Jyxcblx0J3ZpZGVvL21wNCcsXG5cdCdhdWRpby9taWRpJyxcblx0J3ZpZGVvL3gtbWF0cm9za2EnLFxuXHQndmlkZW8vd2VibScsXG5cdCd2aWRlby9xdWlja3RpbWUnLFxuXHQndmlkZW8vdm5kLmF2aScsXG5cdCdhdWRpby92bmQud2F2ZScsXG5cdCdhdWRpby9xY2VscCcsXG5cdCdhdWRpby94LW1zLWFzZicsXG5cdCd2aWRlby94LW1zLWFzZicsXG5cdCdhcHBsaWNhdGlvbi92bmQubXMtYXNmJyxcblx0J3ZpZGVvL21wZWcnLFxuXHQndmlkZW8vM2dwcCcsXG5cdCdhdWRpby9tcGVnJyxcblx0J2F1ZGlvL21wNCcsIC8vIFJGQyA0MzM3XG5cdCdhdWRpby9vcHVzJyxcblx0J3ZpZGVvL29nZycsXG5cdCdhdWRpby9vZ2cnLFxuXHQnYXBwbGljYXRpb24vb2dnJyxcblx0J2F1ZGlvL3gtZmxhYycsXG5cdCdhdWRpby9hcGUnLFxuXHQnYXVkaW8vd2F2cGFjaycsXG5cdCdhdWRpby9hbXInLFxuXHQnYXBwbGljYXRpb24vcGRmJyxcblx0J2FwcGxpY2F0aW9uL3gtZWxmJyxcblx0J2FwcGxpY2F0aW9uL3gtbWFjaC1iaW5hcnknLFxuXHQnYXBwbGljYXRpb24veC1tc2Rvd25sb2FkJyxcblx0J2FwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoJyxcblx0J2FwcGxpY2F0aW9uL3J0ZicsXG5cdCdhcHBsaWNhdGlvbi93YXNtJyxcblx0J2ZvbnQvd29mZicsXG5cdCdmb250L3dvZmYyJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1mb250b2JqZWN0Jyxcblx0J2ZvbnQvdHRmJyxcblx0J2ZvbnQvb3RmJyxcblx0J2ltYWdlL3gtaWNvbicsXG5cdCd2aWRlby94LWZsdicsXG5cdCdhcHBsaWNhdGlvbi9wb3N0c2NyaXB0Jyxcblx0J2FwcGxpY2F0aW9uL2VwcycsXG5cdCdhcHBsaWNhdGlvbi94LXh6Jyxcblx0J2FwcGxpY2F0aW9uL3gtc3FsaXRlMycsXG5cdCdhcHBsaWNhdGlvbi94LW5pbnRlbmRvLW5lcy1yb20nLFxuXHQnYXBwbGljYXRpb24veC1nb29nbGUtY2hyb21lLWV4dGVuc2lvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQubXMtY2FiLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24veC1kZWInLFxuXHQnYXBwbGljYXRpb24veC11bml4LWFyY2hpdmUnLFxuXHQnYXBwbGljYXRpb24veC1ycG0nLFxuXHQnYXBwbGljYXRpb24veC1jb21wcmVzcycsXG5cdCdhcHBsaWNhdGlvbi94LWx6aXAnLFxuXHQnYXBwbGljYXRpb24veC1jZmInLFxuXHQnYXBwbGljYXRpb24veC1taWUnLFxuXHQnYXBwbGljYXRpb24vbXhmJyxcblx0J3ZpZGVvL21wMnQnLFxuXHQnYXBwbGljYXRpb24veC1ibGVuZGVyJyxcblx0J2ltYWdlL2JwZycsXG5cdCdpbWFnZS9qMmMnLFxuXHQnaW1hZ2UvanAyJyxcblx0J2ltYWdlL2pweCcsXG5cdCdpbWFnZS9qcG0nLFxuXHQnaW1hZ2UvbWoyJyxcblx0J2F1ZGlvL2FpZmYnLFxuXHQnYXBwbGljYXRpb24veG1sJyxcblx0J2FwcGxpY2F0aW9uL3gtbW9iaXBvY2tldC1lYm9vaycsXG5cdCdpbWFnZS9oZWlmJyxcblx0J2ltYWdlL2hlaWYtc2VxdWVuY2UnLFxuXHQnaW1hZ2UvaGVpYycsXG5cdCdpbWFnZS9oZWljLXNlcXVlbmNlJyxcblx0J2ltYWdlL2ljbnMnLFxuXHQnaW1hZ2Uva3R4Jyxcblx0J2FwcGxpY2F0aW9uL2RpY29tJyxcblx0J2F1ZGlvL3gtbXVzZXBhY2snLFxuXHQndGV4dC9jYWxlbmRhcicsXG5cdCd0ZXh0L3ZjYXJkJyxcblx0J21vZGVsL2dsdGYtYmluYXJ5Jyxcblx0J2FwcGxpY2F0aW9uL3ZuZC50Y3BkdW1wLnBjYXAnLFxuXHQnYXVkaW8veC1kc2YnLCAvLyBOb24tc3RhbmRhcmRcblx0J2FwcGxpY2F0aW9uL3gubXMuc2hvcnRjdXQnLCAvLyBJbnZlbnRlZCBieSB1c1xuXHQnYXBwbGljYXRpb24veC5hcHBsZS5hbGlhcycsIC8vIEludmVudGVkIGJ5IHVzXG5cdCdhdWRpby94LXZvYycsXG5cdCdhdWRpby92bmQuZG9sYnkuZGQtcmF3Jyxcblx0J2F1ZGlvL3gtbTRhJyxcblx0J2ltYWdlL2FwbmcnLFxuXHQnaW1hZ2UveC1vbHltcHVzLW9yZicsXG5cdCdpbWFnZS94LXNvbnktYXJ3Jyxcblx0J2ltYWdlL3gtYWRvYmUtZG5nJyxcblx0J2ltYWdlL3gtbmlrb24tbmVmJyxcblx0J2ltYWdlL3gtcGFuYXNvbmljLXJ3MicsXG5cdCdpbWFnZS94LWZ1amlmaWxtLXJhZicsXG5cdCd2aWRlby94LW00dicsXG5cdCd2aWRlby8zZ3BwMicsXG5cdCdhcHBsaWNhdGlvbi94LWVzcmktc2hhcGUnLFxuXHQnYXVkaW8vYWFjJyxcblx0J2F1ZGlvL3gtaXQnLFxuXHQnYXVkaW8veC1zM20nLFxuXHQnYXVkaW8veC14bScsXG5cdCd2aWRlby9NUDFTJyxcblx0J3ZpZGVvL01QMlAnLFxuXHQnYXBwbGljYXRpb24vdm5kLnNrZXRjaHVwLnNrcCcsXG5cdCdpbWFnZS9hdmlmJyxcblx0J2FwcGxpY2F0aW9uL3gtbHpoLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24vcGdwLWVuY3J5cHRlZCcsXG5cdCdhcHBsaWNhdGlvbi94LWFzYXInLFxuXHQnbW9kZWwvc3RsJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1odG1saGVscCcsXG5cdCdtb2RlbC8zbWYnLFxuXHQnaW1hZ2UvanhsJyxcblx0J2FwcGxpY2F0aW9uL3pzdGQnLFxuXHQnaW1hZ2UvamxzJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1vdXRsb29rJyxcblx0J2ltYWdlL3ZuZC5kd2cnLFxuXHQnYXBwbGljYXRpb24veC1wYXJxdWV0Jyxcblx0J2FwcGxpY2F0aW9uL2phdmEtdm0nLFxuXHQnYXBwbGljYXRpb24veC1hcmonLFxuXHQnYXBwbGljYXRpb24veC1jcGlvJyxcblx0J2FwcGxpY2F0aW9uL3gtYWNlLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24vYXZybycsXG5cdCdhcHBsaWNhdGlvbi92bmQuaWNjcHJvZmlsZScsXG5cdCdhcHBsaWNhdGlvbi94LmF1dG9kZXNrLmZieCcsIC8vIEludmVudGVkIGJ5IHVzXG5dO1xuIiwiaW1wb3J0IHtCdWZmZXJ9IGZyb20gJ25vZGU6YnVmZmVyJztcbmltcG9ydCAqIGFzIFRva2VuIGZyb20gJ3Rva2VuLXR5cGVzJztcbmltcG9ydCAqIGFzIHN0cnRvazMgZnJvbSAnc3RydG9rMy9jb3JlJzsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuL2ZpbGUtZXh0ZW5zaW9uLWluLWltcG9ydFxuaW1wb3J0IHtcblx0c3RyaW5nVG9CeXRlcyxcblx0dGFySGVhZGVyQ2hlY2tzdW1NYXRjaGVzLFxuXHR1aW50MzJTeW5jU2FmZVRva2VuLFxufSBmcm9tICcuL3V0aWwuanMnO1xuaW1wb3J0IHtleHRlbnNpb25zLCBtaW1lVHlwZXN9IGZyb20gJy4vc3VwcG9ydGVkLmpzJztcblxuY29uc3QgbWluaW11bUJ5dGVzID0gNDEwMDsgLy8gQSBmYWlyIGFtb3VudCBvZiBmaWxlLXR5cGVzIGFyZSBkZXRlY3RhYmxlIHdpdGhpbiB0aGlzIHJhbmdlLlxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVGcm9tU3RyZWFtKHN0cmVhbSkge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkuZnJvbVN0cmVhbShzdHJlYW0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVGcm9tQnVmZmVyKGlucHV0KSB7XG5cdHJldHVybiBuZXcgRmlsZVR5cGVQYXJzZXIoKS5mcm9tQnVmZmVyKGlucHV0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbGVUeXBlRnJvbUJsb2IoYmxvYikge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkuZnJvbUJsb2IoYmxvYik7XG59XG5cbmZ1bmN0aW9uIF9jaGVjayhidWZmZXIsIGhlYWRlcnMsIG9wdGlvbnMpIHtcblx0b3B0aW9ucyA9IHtcblx0XHRvZmZzZXQ6IDAsXG5cdFx0Li4ub3B0aW9ucyxcblx0fTtcblxuXHRmb3IgKGNvbnN0IFtpbmRleCwgaGVhZGVyXSBvZiBoZWFkZXJzLmVudHJpZXMoKSkge1xuXHRcdC8vIElmIGEgYml0bWFzayBpcyBzZXRcblx0XHRpZiAob3B0aW9ucy5tYXNrKSB7XG5cdFx0XHQvLyBJZiBoZWFkZXIgZG9lc24ndCBlcXVhbCBgYnVmYCB3aXRoIGJpdHMgbWFza2VkIG9mZlxuXHRcdFx0aWYgKGhlYWRlciAhPT0gKG9wdGlvbnMubWFza1tpbmRleF0gJiBidWZmZXJbaW5kZXggKyBvcHRpb25zLm9mZnNldF0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gYnVmZmVyW2luZGV4ICsgb3B0aW9ucy5vZmZzZXRdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaWxlVHlwZUZyb21Ub2tlbml6ZXIodG9rZW5pemVyKSB7XG5cdHJldHVybiBuZXcgRmlsZVR5cGVQYXJzZXIoKS5mcm9tVG9rZW5pemVyKHRva2VuaXplcik7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlVHlwZVBhcnNlciB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcblx0XHR0aGlzLmRldGVjdG9ycyA9IG9wdGlvbnM/LmN1c3RvbURldGVjdG9ycztcblxuXHRcdHRoaXMuZnJvbVRva2VuaXplciA9IHRoaXMuZnJvbVRva2VuaXplci5iaW5kKHRoaXMpO1xuXHRcdHRoaXMuZnJvbUJ1ZmZlciA9IHRoaXMuZnJvbUJ1ZmZlci5iaW5kKHRoaXMpO1xuXHRcdHRoaXMucGFyc2UgPSB0aGlzLnBhcnNlLmJpbmQodGhpcyk7XG5cdH1cblxuXHRhc3luYyBmcm9tVG9rZW5pemVyKHRva2VuaXplcikge1xuXHRcdGNvbnN0IGluaXRpYWxQb3NpdGlvbiA9IHRva2VuaXplci5wb3NpdGlvbjtcblxuXHRcdGZvciAoY29uc3QgZGV0ZWN0b3Igb2YgdGhpcy5kZXRlY3RvcnMgfHwgW10pIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgZGV0ZWN0b3IodG9rZW5pemVyKTtcblx0XHRcdGlmIChmaWxlVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVR5cGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbml0aWFsUG9zaXRpb24gIT09IHRva2VuaXplci5wb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBDYW5ub3QgcHJvY2VlZCBzY2FubmluZyBvZiB0aGUgdG9rZW5pemVyIGlzIGF0IGFuIGFyYml0cmFyeSBwb3NpdGlvblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnBhcnNlKHRva2VuaXplcik7XG5cdH1cblxuXHRhc3luYyBmcm9tQnVmZmVyKGlucHV0KSB7XG5cdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8IGlucHV0IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKGBFeHBlY3RlZCB0aGUgXFxgaW5wdXRcXGAgYXJndW1lbnQgdG8gYmUgb2YgdHlwZSBcXGBVaW50OEFycmF5XFxgIG9yIFxcYEJ1ZmZlclxcYCBvciBcXGBBcnJheUJ1ZmZlclxcYCwgZ290IFxcYCR7dHlwZW9mIGlucHV0fVxcYGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1ZmZlciA9IGlucHV0IGluc3RhbmNlb2YgVWludDhBcnJheSA/IGlucHV0IDogbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuXG5cdFx0aWYgKCEoYnVmZmVyPy5sZW5ndGggPiAxKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZyb21Ub2tlbml6ZXIoc3RydG9rMy5mcm9tQnVmZmVyKGJ1ZmZlcikpO1xuXHR9XG5cblx0YXN5bmMgZnJvbUJsb2IoYmxvYikge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IGJsb2IuYXJyYXlCdWZmZXIoKTtcblx0XHRyZXR1cm4gdGhpcy5mcm9tQnVmZmVyKG5ldyBVaW50OEFycmF5KGJ1ZmZlcikpO1xuXHR9XG5cblx0YXN5bmMgZnJvbVN0cmVhbShzdHJlYW0pIHtcblx0XHRjb25zdCB0b2tlbml6ZXIgPSBhd2FpdCBzdHJ0b2szLmZyb21TdHJlYW0oc3RyZWFtKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZnJvbVRva2VuaXplcih0b2tlbml6ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuY2xvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB0b0RldGVjdGlvblN0cmVhbShyZWFkYWJsZVN0cmVhbSwgb3B0aW9ucyA9IHt9KSB7XG5cdFx0Y29uc3Qge2RlZmF1bHQ6IHN0cmVhbX0gPSBhd2FpdCBpbXBvcnQoJ25vZGU6c3RyZWFtJyk7XG5cdFx0Y29uc3Qge3NhbXBsZVNpemUgPSBtaW5pbXVtQnl0ZXN9ID0gb3B0aW9ucztcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRyZWFkYWJsZVN0cmVhbS5vbignZXJyb3InLCByZWplY3QpO1xuXG5cdFx0XHRyZWFkYWJsZVN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Ly8gU2V0IHVwIG91dHB1dCBzdHJlYW1cblx0XHRcdFx0XHRcdGNvbnN0IHBhc3MgPSBuZXcgc3RyZWFtLlBhc3NUaHJvdWdoKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXRTdHJlYW0gPSBzdHJlYW0ucGlwZWxpbmUgPyBzdHJlYW0ucGlwZWxpbmUocmVhZGFibGVTdHJlYW0sIHBhc3MsICgpID0+IHt9KSA6IHJlYWRhYmxlU3RyZWFtLnBpcGUocGFzcyk7XG5cblx0XHRcdFx0XHRcdC8vIFJlYWQgdGhlIGlucHV0IHN0cmVhbSBhbmQgZGV0ZWN0IHRoZSBmaWxldHlwZVxuXHRcdFx0XHRcdFx0Y29uc3QgY2h1bmsgPSByZWFkYWJsZVN0cmVhbS5yZWFkKHNhbXBsZVNpemUpID8/IHJlYWRhYmxlU3RyZWFtLnJlYWQoKSA/PyBCdWZmZXIuYWxsb2MoMCk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRwYXNzLmZpbGVUeXBlID0gYXdhaXQgdGhpcy5mcm9tQnVmZmVyKGNodW5rKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIHN0cnRvazMuRW5kT2ZTdHJlYW1FcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdHBhc3MuZmlsZVR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXNvbHZlKG91dHB1dFN0cmVhbSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRjaGVjayhoZWFkZXIsIG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gX2NoZWNrKHRoaXMuYnVmZmVyLCBoZWFkZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y2hlY2tTdHJpbmcoaGVhZGVyLCBvcHRpb25zKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hlY2soc3RyaW5nVG9CeXRlcyhoZWFkZXIpLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHBhcnNlKHRva2VuaXplcikge1xuXHRcdHRoaXMuYnVmZmVyID0gQnVmZmVyLmFsbG9jKG1pbmltdW1CeXRlcyk7XG5cblx0XHQvLyBLZWVwIHJlYWRpbmcgdW50aWwgRU9GIGlmIHRoZSBmaWxlIHNpemUgaXMgdW5rbm93bi5cblx0XHRpZiAodG9rZW5pemVyLmZpbGVJbmZvLnNpemUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9rZW5pemVyLmZpbGVJbmZvLnNpemUgPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHR9XG5cblx0XHR0aGlzLnRva2VuaXplciA9IHRva2VuaXplcjtcblxuXHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAxMiwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cblx0XHQvLyAtLSAyLWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDIsIDB4NERdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYm1wJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2JtcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDBCLCAweDc3XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FjMycsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby92bmQuZG9sYnkuZGQtcmF3Jyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NzgsIDB4MDFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZG1nJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtYXBwbGUtZGlza2ltYWdlJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEQsIDB4NUFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZXhlJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbXNkb3dubG9hZCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDI1LCAweDIxXSkpIHtcblx0XHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAyNCwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5jaGVja1N0cmluZygnUFMtQWRvYmUtJywge29mZnNldDogMn0pXG5cdFx0XHRcdCYmIHRoaXMuY2hlY2tTdHJpbmcoJyBFUFNGLScsIHtvZmZzZXQ6IDE0fSlcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2VwcycsXG5cdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL2VwcycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3Bvc3RzY3JpcHQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDFGLCAweEEwXSlcblx0XHRcdHx8IHRoaXMuY2hlY2soWzB4MUYsIDB4OURdKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnWicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNvbXByZXNzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4QzcsIDB4NzFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY3BpbycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNwaW8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg2MCwgMHhFQV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdhcmonLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hcmonLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSAzLWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RUYsIDB4QkIsIDB4QkZdKSkgeyAvLyBVVEYtOC1CT01cblx0XHRcdC8vIFN0cmlwIG9mZiBVVEYtOC1CT01cblx0XHRcdHRoaXMudG9rZW5pemVyLmlnbm9yZSgzKTtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlKHRva2VuaXplcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDcsIDB4NDksIDB4NDZdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZ2lmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2dpZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ5LCAweDQ5LCAweEJDXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2p4cicsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS92bmQubXMtcGhvdG8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgxRiwgMHg4QiwgMHg4XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2d6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL2d6aXAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0MiwgMHg1QSwgMHg2OF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdiejInLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1iemlwMicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJRDMnKSkge1xuXHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSg2KTsgLy8gU2tpcCBJRDMgaGVhZGVyIHVudGlsIHRoZSBoZWFkZXIgc2l6ZVxuXHRcdFx0Y29uc3QgaWQzSGVhZGVyTGVuZ3RoID0gYXdhaXQgdG9rZW5pemVyLnJlYWRUb2tlbih1aW50MzJTeW5jU2FmZVRva2VuKTtcblx0XHRcdGlmICh0b2tlbml6ZXIucG9zaXRpb24gKyBpZDNIZWFkZXJMZW5ndGggPiB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSkge1xuXHRcdFx0XHQvLyBHdWVzcyBmaWxlIHR5cGUgYmFzZWQgb24gSUQzIGhlYWRlciBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ21wMycsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL21wZWcnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGlkM0hlYWRlckxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5mcm9tVG9rZW5pemVyKHRva2VuaXplcik7IC8vIFNraXAgSUQzIGhlYWRlciwgcmVjdXJzaW9uXG5cdFx0fVxuXG5cdFx0Ly8gTXVzZXBhY2ssIFNWN1xuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdNUCsnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbXBjJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtbXVzZXBhY2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQodGhpcy5idWZmZXJbMF0gPT09IDB4NDMgfHwgdGhpcy5idWZmZXJbMF0gPT09IDB4NDYpXG5cdFx0XHQmJiB0aGlzLmNoZWNrKFsweDU3LCAweDUzXSwge29mZnNldDogMX0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzd2YnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA0LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0Ly8gUmVxdWlyZXMgYSBzYW1wbGUgc2l6ZSBvZiA0IGJ5dGVzXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4RDgsIDB4RkZdKSkge1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4RjddLCB7b2Zmc2V0OiAzfSkpIHsgLy8gSlBHNy9TT0Y1NSwgaW5kaWNhdGluZyBhIElTTy9JRUMgMTQ0OTUgLyBKUEVHLUxTIGZpbGVcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdqbHMnLFxuXHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9qbHMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqcGcnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvanBlZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDRGLCAweDYyLCAweDZBLCAweDAxXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2F2cm8nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vYXZybycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGTElGJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsaWYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvZmxpZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCc4QlBTJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BzZCcsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS92bmQuYWRvYmUucGhvdG9zaG9wJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ1dFQlAnLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3dlYnAnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2Uvd2VicCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE11c2VwYWNrLCBTVjhcblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnTVBDSycpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtcGMnLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC1tdXNlcGFjaycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGT1JNJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FpZicsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9haWZmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ2ljbnMnLCB7b2Zmc2V0OiAwfSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ljbnMnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvaWNucycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFppcC1iYXNlZCBmaWxlIGZvcm1hdHNcblx0XHQvLyBOZWVkIHRvIGJlIGJlZm9yZSB0aGUgYHppcGAgY2hlY2tcblx0XHRpZiAodGhpcy5jaGVjayhbMHg1MCwgMHg0QiwgMHgzLCAweDRdKSkgeyAvLyBMb2NhbCBmaWxlIGhlYWRlciBzaWduYXR1cmVcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHdoaWxlICh0b2tlbml6ZXIucG9zaXRpb24gKyAzMCA8IHRva2VuaXplci5maWxlSW5mby5zaXplKSB7XG5cdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIodGhpcy5idWZmZXIsIHtsZW5ndGg6IDMwfSk7XG5cblx0XHRcdFx0XHQvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9aaXBfKGZpbGVfZm9ybWF0KSNGaWxlX2hlYWRlcnNcblx0XHRcdFx0XHRjb25zdCB6aXBIZWFkZXIgPSB7XG5cdFx0XHRcdFx0XHRjb21wcmVzc2VkU2l6ZTogdGhpcy5idWZmZXIucmVhZFVJbnQzMkxFKDE4KSxcblx0XHRcdFx0XHRcdHVuY29tcHJlc3NlZFNpemU6IHRoaXMuYnVmZmVyLnJlYWRVSW50MzJMRSgyMiksXG5cdFx0XHRcdFx0XHRmaWxlbmFtZUxlbmd0aDogdGhpcy5idWZmZXIucmVhZFVJbnQxNkxFKDI2KSxcblx0XHRcdFx0XHRcdGV4dHJhRmllbGRMZW5ndGg6IHRoaXMuYnVmZmVyLnJlYWRVSW50MTZMRSgyOCksXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHppcEhlYWRlci5maWxlbmFtZSA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoemlwSGVhZGVyLmZpbGVuYW1lTGVuZ3RoLCAndXRmLTgnKSk7XG5cdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSh6aXBIZWFkZXIuZXh0cmFGaWVsZExlbmd0aCk7XG5cblx0XHRcdFx0XHQvLyBBc3N1bWVzIHNpZ25lZCBgLnhwaWAgZnJvbSBhZGRvbnMubW96aWxsYS5vcmdcblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmZpbGVuYW1lID09PSAnTUVUQS1JTkYvbW96aWxsYS5yc2EnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRleHQ6ICd4cGknLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC14cGluc3RhbGwnLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmZpbGVuYW1lLmVuZHNXaXRoKCcucmVscycpIHx8IHppcEhlYWRlci5maWxlbmFtZS5lbmRzV2l0aCgnLnhtbCcpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0eXBlID0gemlwSGVhZGVyLmZpbGVuYW1lLnNwbGl0KCcvJylbMF07XG5cdFx0XHRcdFx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSAnX3JlbHMnOlxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlICd3b3JkJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnZG9jeCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3BwdCc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ3BwdHgnLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5wcmVzZW50YXRpb25tbC5wcmVzZW50YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3hsJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAneGxzeCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuc2hlZXQnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHppcEhlYWRlci5maWxlbmFtZS5zdGFydHNXaXRoKCd4bC8nKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZXh0OiAneGxzeCcsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldCcsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh6aXBIZWFkZXIuZmlsZW5hbWUuc3RhcnRzV2l0aCgnM0QvJykgJiYgemlwSGVhZGVyLmZpbGVuYW1lLmVuZHNXaXRoKCcubW9kZWwnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZXh0OiAnM21mJyxcblx0XHRcdFx0XHRcdFx0bWltZTogJ21vZGVsLzNtZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFRoZSBkb2N4LCB4bHN4IGFuZCBwcHR4IGZpbGUgdHlwZXMgZXh0ZW5kIHRoZSBPZmZpY2UgT3BlbiBYTUwgZmlsZSBmb3JtYXQ6XG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvT2ZmaWNlX09wZW5fWE1MX2ZpbGVfZm9ybWF0c1xuXHRcdFx0XHRcdC8vIFdlIGxvb2sgZm9yOlxuXHRcdFx0XHRcdC8vIC0gb25lIGVudHJ5IG5hbWVkICdbQ29udGVudF9UeXBlc10ueG1sJyBvciAnX3JlbHMvLnJlbHMnLFxuXHRcdFx0XHRcdC8vIC0gb25lIGVudHJ5IGluZGljYXRpbmcgc3BlY2lmaWMgdHlwZSBvZiBmaWxlLlxuXHRcdFx0XHRcdC8vIE1TIE9mZmljZSwgT3Blbk9mZmljZSBhbmQgTGlicmVPZmZpY2UgbWF5IHB1dCB0aGUgcGFydHMgaW4gZGlmZmVyZW50IG9yZGVyLCBzbyB0aGUgY2hlY2sgc2hvdWxkIG5vdCByZWx5IG9uIGl0LlxuXHRcdFx0XHRcdGlmICh6aXBIZWFkZXIuZmlsZW5hbWUgPT09ICdtaW1ldHlwZScgJiYgemlwSGVhZGVyLmNvbXByZXNzZWRTaXplID09PSB6aXBIZWFkZXIudW5jb21wcmVzc2VkU2l6ZSkge1xuXHRcdFx0XHRcdFx0bGV0IG1pbWVUeXBlID0gYXdhaXQgdG9rZW5pemVyLnJlYWRUb2tlbihuZXcgVG9rZW4uU3RyaW5nVHlwZSh6aXBIZWFkZXIuY29tcHJlc3NlZFNpemUsICd1dGYtOCcpKTtcblx0XHRcdFx0XHRcdG1pbWVUeXBlID0gbWltZVR5cGUudHJpbSgpO1xuXG5cdFx0XHRcdFx0XHRzd2l0Y2ggKG1pbWVUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2FwcGxpY2F0aW9uL2VwdWIremlwJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnZXB1YicsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZXB1Yit6aXAnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2FwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQudGV4dCc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ29kdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC50ZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRjYXNlICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnNwcmVhZHNoZWV0Jzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnb2RzJyxcblx0XHRcdFx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnNwcmVhZHNoZWV0Jyxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRjYXNlICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnByZXNlbnRhdGlvbic6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ29kcCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5wcmVzZW50YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVHJ5IHRvIGZpbmQgbmV4dCBoZWFkZXIgbWFudWFsbHkgd2hlbiBjdXJyZW50IG9uZSBpcyBjb3JydXB0ZWRcblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmNvbXByZXNzZWRTaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHRsZXQgbmV4dEhlYWRlckluZGV4ID0gLTE7XG5cblx0XHRcdFx0XHRcdHdoaWxlIChuZXh0SGVhZGVySW5kZXggPCAwICYmICh0b2tlbml6ZXIucG9zaXRpb24gPCB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSkpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnBlZWtCdWZmZXIodGhpcy5idWZmZXIsIHttYXlCZUxlc3M6IHRydWV9KTtcblxuXHRcdFx0XHRcdFx0XHRuZXh0SGVhZGVySW5kZXggPSB0aGlzLmJ1ZmZlci5pbmRleE9mKCc1MDRCMDMwNCcsIDAsICdoZXgnKTtcblx0XHRcdFx0XHRcdFx0Ly8gTW92ZSBwb3NpdGlvbiB0byB0aGUgbmV4dCBoZWFkZXIgaWYgZm91bmQsIHNraXAgdGhlIHdob2xlIGJ1ZmZlciBvdGhlcndpc2Vcblx0XHRcdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZShuZXh0SGVhZGVySW5kZXggPj0gMCA/IG5leHRIZWFkZXJJbmRleCA6IHRoaXMuYnVmZmVyLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoemlwSGVhZGVyLmNvbXByZXNzZWRTaXplKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghKGVycm9yIGluc3RhbmNlb2Ygc3RydG9rMy5FbmRPZlN0cmVhbUVycm9yKSkge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3ppcCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi96aXAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnT2dnUycpKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGFuIE9HRyBjb250YWluZXJcblx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoMjgpO1xuXHRcdFx0Y29uc3QgdHlwZSA9IEJ1ZmZlci5hbGxvYyg4KTtcblx0XHRcdGF3YWl0IHRva2VuaXplci5yZWFkQnVmZmVyKHR5cGUpO1xuXG5cdFx0XHQvLyBOZWVkcyB0byBiZSBiZWZvcmUgYG9nZ2AgY2hlY2tcblx0XHRcdGlmIChfY2hlY2sodHlwZSwgWzB4NEYsIDB4NzAsIDB4NzUsIDB4NzMsIDB4NDgsIDB4NjUsIDB4NjEsIDB4NjRdKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ29wdXMnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vcHVzJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgJyB0aGVvcmEnIGluIGhlYWRlci5cblx0XHRcdGlmIChfY2hlY2sodHlwZSwgWzB4ODAsIDB4NzQsIDB4NjgsIDB4NjUsIDB4NkYsIDB4NzIsIDB4NjFdKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ29ndicsXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL29nZycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmICdcXHgwMXZpZGVvJyBpbiBoZWFkZXIuXG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDAxLCAweDc2LCAweDY5LCAweDY0LCAweDY1LCAweDZGLCAweDAwXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdvZ20nLFxuXHRcdFx0XHRcdG1pbWU6ICd2aWRlby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiAnIEZMQUMnIGluIGhlYWRlciAgaHR0cHM6Ly94aXBoLm9yZy9mbGFjL2ZhcS5odG1sXG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDdGLCAweDQ2LCAweDRDLCAweDQxLCAweDQzXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdvZ2EnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAnU3BlZXggICcgaW4gaGVhZGVyIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NwZWV4XG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDUzLCAweDcwLCAweDY1LCAweDY1LCAweDc4LCAweDIwLCAweDIwXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdzcHgnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiAnXFx4MDF2b3JiaXMnIGluIGhlYWRlclxuXHRcdFx0aWYgKF9jaGVjayh0eXBlLCBbMHgwMSwgMHg3NiwgMHg2RiwgMHg3MiwgMHg2MiwgMHg2OSwgMHg3M10pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnb2dnJyxcblx0XHRcdFx0XHRtaW1lOiAnYXVkaW8vb2dnJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVmYXVsdCBPR0cgY29udGFpbmVyIGh0dHBzOi8vd3d3LmlhbmEub3JnL2Fzc2lnbm1lbnRzL21lZGlhLXR5cGVzL2FwcGxpY2F0aW9uL29nZ1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnb2d4Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL29nZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4NTAsIDB4NEJdKVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzJdID09PSAweDMgfHwgdGhpcy5idWZmZXJbMl0gPT09IDB4NSB8fCB0aGlzLmJ1ZmZlclsyXSA9PT0gMHg3KVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzNdID09PSAweDQgfHwgdGhpcy5idWZmZXJbM10gPT09IDB4NiB8fCB0aGlzLmJ1ZmZlclszXSA9PT0gMHg4KVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnemlwJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ppcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vXG5cblx0XHQvLyBGaWxlIFR5cGUgQm94IChodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9JU09fYmFzZV9tZWRpYV9maWxlX2Zvcm1hdClcblx0XHQvLyBJdCdzIG5vdCByZXF1aXJlZCB0byBiZSBmaXJzdCwgYnV0IGl0J3MgcmVjb21tZW5kZWQgdG8gYmUuIEFsbW9zdCBhbGwgSVNPIGJhc2UgbWVkaWEgZmlsZXMgc3RhcnQgd2l0aCBgZnR5cGAgYm94LlxuXHRcdC8vIGBmdHlwYCBib3ggbXVzdCBjb250YWluIGEgYnJhbmQgbWFqb3IgaWRlbnRpZmllciwgd2hpY2ggbXVzdCBjb25zaXN0IG9mIElTTyA4ODU5LTEgcHJpbnRhYmxlIGNoYXJhY3RlcnMuXG5cdFx0Ly8gSGVyZSB3ZSBjaGVjayBmb3IgODg1OS0xIHByaW50YWJsZSBjaGFyYWN0ZXJzIChmb3Igc2ltcGxpY2l0eSwgaXQncyBhIG1hc2sgd2hpY2ggYWxzbyBjYXRjaGVzIG9uZSBub24tcHJpbnRhYmxlIGNoYXJhY3RlcikuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnZnR5cCcsIHtvZmZzZXQ6IDR9KVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzhdICYgMHg2MCkgIT09IDB4MDAgLy8gQnJhbmQgbWFqb3IsIGZpcnN0IGNoYXJhY3RlciBBU0NJST9cblx0XHQpIHtcblx0XHRcdC8vIFRoZXkgYWxsIGNhbiBoYXZlIE1JTUUgYHZpZGVvL21wNGAgZXhjZXB0IGBhcHBsaWNhdGlvbi9tcDRgIHNwZWNpYWwtY2FzZSB3aGljaCBpcyBoYXJkIHRvIGRldGVjdC5cblx0XHRcdC8vIEZvciBzb21lIGNhc2VzLCB3ZSdyZSBzcGVjaWZpYywgZXZlcnl0aGluZyBlbHNlIGZhbGxzIHRvIGB2aWRlby9tcDRgIHdpdGggYG1wNGAgZXh0ZW5zaW9uLlxuXHRcdFx0Y29uc3QgYnJhbmRNYWpvciA9IHRoaXMuYnVmZmVyLnRvU3RyaW5nKCdiaW5hcnknLCA4LCAxMikucmVwbGFjZSgnXFwwJywgJyAnKS50cmltKCk7XG5cdFx0XHRzd2l0Y2ggKGJyYW5kTWFqb3IpIHtcblx0XHRcdFx0Y2FzZSAnYXZpZic6XG5cdFx0XHRcdGNhc2UgJ2F2aXMnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnYXZpZicsIG1pbWU6ICdpbWFnZS9hdmlmJ307XG5cdFx0XHRcdGNhc2UgJ21pZjEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnaGVpYycsIG1pbWU6ICdpbWFnZS9oZWlmJ307XG5cdFx0XHRcdGNhc2UgJ21zZjEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnaGVpYycsIG1pbWU6ICdpbWFnZS9oZWlmLXNlcXVlbmNlJ307XG5cdFx0XHRcdGNhc2UgJ2hlaWMnOlxuXHRcdFx0XHRjYXNlICdoZWl4Jzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ2hlaWMnLCBtaW1lOiAnaW1hZ2UvaGVpYyd9O1xuXHRcdFx0XHRjYXNlICdoZXZjJzpcblx0XHRcdFx0Y2FzZSAnaGV2eCc6XG5cdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICdoZWljJywgbWltZTogJ2ltYWdlL2hlaWMtc2VxdWVuY2UnfTtcblx0XHRcdFx0Y2FzZSAncXQnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnbW92JywgbWltZTogJ3ZpZGVvL3F1aWNrdGltZSd9O1xuXHRcdFx0XHRjYXNlICdNNFYnOlxuXHRcdFx0XHRjYXNlICdNNFZIJzpcblx0XHRcdFx0Y2FzZSAnTTRWUCc6XG5cdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICdtNHYnLCBtaW1lOiAndmlkZW8veC1tNHYnfTtcblx0XHRcdFx0Y2FzZSAnTTRQJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200cCcsIG1pbWU6ICd2aWRlby9tcDQnfTtcblx0XHRcdFx0Y2FzZSAnTTRCJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200YicsIG1pbWU6ICdhdWRpby9tcDQnfTtcblx0XHRcdFx0Y2FzZSAnTTRBJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200YScsIG1pbWU6ICdhdWRpby94LW00YSd9O1xuXHRcdFx0XHRjYXNlICdGNFYnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjR2JywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNFAnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRwJywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNEEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRhJywgbWltZTogJ2F1ZGlvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNEInOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRiJywgbWltZTogJ2F1ZGlvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdjcngnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnY3IzJywgbWltZTogJ2ltYWdlL3gtY2Fub24tY3IzJ307XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0aWYgKGJyYW5kTWFqb3Iuc3RhcnRzV2l0aCgnM2cnKSkge1xuXHRcdFx0XHRcdFx0aWYgKGJyYW5kTWFqb3Iuc3RhcnRzV2l0aCgnM2cyJykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICczZzInLCBtaW1lOiAndmlkZW8vM2dwcDInfTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICczZ3AnLCBtaW1lOiAndmlkZW8vM2dwcCd9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnbXA0JywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdNVGhkJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ21pZCcsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9taWRpJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnd09GRicpXG5cdFx0XHQmJiAoXG5cdFx0XHRcdHRoaXMuY2hlY2soWzB4MDAsIDB4MDEsIDB4MDAsIDB4MDBdLCB7b2Zmc2V0OiA0fSlcblx0XHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnT1RUTycsIHtvZmZzZXQ6IDR9KVxuXHRcdFx0KVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnd29mZicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3dvZmYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrU3RyaW5nKCd3T0YyJylcblx0XHRcdCYmIChcblx0XHRcdFx0dGhpcy5jaGVjayhbMHgwMCwgMHgwMSwgMHgwMCwgMHgwMF0sIHtvZmZzZXQ6IDR9KVxuXHRcdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCdPVFRPJywge29mZnNldDogNH0pXG5cdFx0XHQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICd3b2ZmMicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3dvZmYyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RDQsIDB4QzMsIDB4QjIsIDB4QTFdKSB8fCB0aGlzLmNoZWNrKFsweEExLCAweEIyLCAweEMzLCAweEQ0XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BjYXAnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLnRjcGR1bXAucGNhcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFNvbnkgRFNEIFN0cmVhbSBGaWxlIChEU0YpXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0RTRCAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZHNmJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtZHNmJywgLy8gTm9uLXN0YW5kYXJkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdMWklQJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2x6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbHppcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdmTGFDJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsYWMnLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC1mbGFjJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDIsIDB4NTAsIDB4NDcsIDB4RkJdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYnBnJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2JwZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCd3dnBrJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3d2Jyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3dhdnBhY2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnJVBERicpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDEzNTApO1xuXHRcdFx0XHRjb25zdCBtYXhCdWZmZXJTaXplID0gMTAgKiAxMDI0ICogMTAyNDtcblx0XHRcdFx0Y29uc3QgYnVmZmVyID0gQnVmZmVyLmFsbG9jKE1hdGgubWluKG1heEJ1ZmZlclNpemUsIHRva2VuaXplci5maWxlSW5mby5zaXplKSk7XG5cdFx0XHRcdGF3YWl0IHRva2VuaXplci5yZWFkQnVmZmVyKGJ1ZmZlciwge21heUJlTGVzczogdHJ1ZX0pO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYW4gQWRvYmUgSWxsdXN0cmF0b3IgZmlsZVxuXHRcdFx0XHRpZiAoYnVmZmVyLmluY2x1ZGVzKEJ1ZmZlci5mcm9tKCdBSVByaXZhdGVEYXRhJykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2FpJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi9wb3N0c2NyaXB0Jyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBTd2FsbG93IGVuZCBvZiBzdHJlYW0gZXJyb3IgaWYgZmlsZSBpcyB0b28gc21hbGwgZm9yIHRoZSBBZG9iZSBBSSBjaGVja1xuXHRcdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIHN0cnRvazMuRW5kT2ZTdHJlYW1FcnJvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBc3N1bWUgdGhpcyBpcyBqdXN0IGEgbm9ybWFsIFBERlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncGRmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3BkZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDYxLCAweDczLCAweDZEXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3dhc20nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vd2FzbScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFRJRkYsIGxpdHRsZS1lbmRpYW4gdHlwZVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ5LCAweDQ5XSkpIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZkhlYWRlcihmYWxzZSk7XG5cdFx0XHRpZiAoZmlsZVR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIGZpbGVUeXBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRJRkYsIGJpZy1lbmRpYW4gdHlwZVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDRELCAweDREXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZkhlYWRlcih0cnVlKTtcblx0XHRcdGlmIChmaWxlVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ01BQyAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXBlJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL2FwZScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9maWxlL2ZpbGUvYmxvYi9tYXN0ZXIvbWFnaWMvTWFnZGlyL21hdHJvc2thXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MUEsIDB4NDUsIDB4REYsIDB4QTNdKSkgeyAvLyBSb290IGVsZW1lbnQ6IEVCTUxcblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHJlYWRGaWVsZCgpIHtcblx0XHRcdFx0Y29uc3QgbXNiID0gYXdhaXQgdG9rZW5pemVyLnBlZWtOdW1iZXIoVG9rZW4uVUlOVDgpO1xuXHRcdFx0XHRsZXQgbWFzayA9IDB4ODA7XG5cdFx0XHRcdGxldCBpYyA9IDA7IC8vIDAgPSBBLCAxID0gQiwgMiA9IEMsIDNcblx0XHRcdFx0Ly8gPSBEXG5cblx0XHRcdFx0d2hpbGUgKChtc2IgJiBtYXNrKSA9PT0gMCAmJiBtYXNrICE9PSAwKSB7XG5cdFx0XHRcdFx0KytpYztcblx0XHRcdFx0XHRtYXNrID4+PSAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWQgPSBCdWZmZXIuYWxsb2MoaWMgKyAxKTtcblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIoaWQpO1xuXHRcdFx0XHRyZXR1cm4gaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHJlYWRFbGVtZW50KCkge1xuXHRcdFx0XHRjb25zdCBpZCA9IGF3YWl0IHJlYWRGaWVsZCgpO1xuXHRcdFx0XHRjb25zdCBsZW5ndGhGaWVsZCA9IGF3YWl0IHJlYWRGaWVsZCgpO1xuXHRcdFx0XHRsZW5ndGhGaWVsZFswXSBePSAweDgwID4+IChsZW5ndGhGaWVsZC5sZW5ndGggLSAxKTtcblx0XHRcdFx0Y29uc3QgbnJMZW5ndGggPSBNYXRoLm1pbig2LCBsZW5ndGhGaWVsZC5sZW5ndGgpOyAvLyBKYXZhU2NyaXB0IGNhbiBtYXggcmVhZCA2IGJ5dGVzIGludGVnZXJcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogaWQucmVhZFVJbnRCRSgwLCBpZC5sZW5ndGgpLFxuXHRcdFx0XHRcdGxlbjogbGVuZ3RoRmllbGQucmVhZFVJbnRCRShsZW5ndGhGaWVsZC5sZW5ndGggLSBuckxlbmd0aCwgbnJMZW5ndGgpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkQ2hpbGRyZW4oY2hpbGRyZW4pIHtcblx0XHRcdFx0d2hpbGUgKGNoaWxkcmVuID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhd2FpdCByZWFkRWxlbWVudCgpO1xuXHRcdFx0XHRcdGlmIChlbGVtZW50LmlkID09PSAweDQyXzgyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByYXdWYWx1ZSA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoZWxlbWVudC5sZW4sICd1dGYtOCcpKTtcblx0XHRcdFx0XHRcdHJldHVybiByYXdWYWx1ZS5yZXBsYWNlKC9cXDAwLiokL2csICcnKTsgLy8gUmV0dXJuIERvY1R5cGVcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGVsZW1lbnQubGVuKTsgLy8gaWdub3JlIHBheWxvYWRcblx0XHRcdFx0XHQtLWNoaWxkcmVuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlID0gYXdhaXQgcmVhZEVsZW1lbnQoKTtcblx0XHRcdGNvbnN0IGRvY1R5cGUgPSBhd2FpdCByZWFkQ2hpbGRyZW4ocmUubGVuKTtcblxuXHRcdFx0c3dpdGNoIChkb2NUeXBlKSB7XG5cdFx0XHRcdGNhc2UgJ3dlYm0nOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRleHQ6ICd3ZWJtJyxcblx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby93ZWJtJyxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNhc2UgJ21hdHJvc2thJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbWt2Jyxcblx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby94LW1hdHJvc2thJyxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJJRkYgZmlsZSBmb3JtYXQgd2hpY2ggbWlnaHQgYmUgQVZJLCBXQVYsIFFDUCwgZXRjXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NTIsIDB4NDksIDB4NDYsIDB4NDZdKSkge1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4NDEsIDB4NTYsIDB4NDldLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdhdmknLFxuXHRcdFx0XHRcdG1pbWU6ICd2aWRlby92bmQuYXZpJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4NTcsIDB4NDEsIDB4NTYsIDB4NDVdLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICd3YXYnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby92bmQud2F2ZScsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIFFMQ00sIFFDUCBmaWxlXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHg1MSwgMHg0QywgMHg0MywgMHg0RF0sIHtvZmZzZXQ6IDh9KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ3FjcCcsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL3FjZWxwJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnU1FMaScpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzcWxpdGUnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1zcWxpdGUzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEUsIDB4NDUsIDB4NTMsIDB4MUFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbmVzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbmludGVuZG8tbmVzLXJvbScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdDcjI0JykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NyeCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWdvb2dsZS1jaHJvbWUtZXh0ZW5zaW9uJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnTVNDRicpXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCdJU2MoJylcblx0XHQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NhYicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtY2FiLWNvbXByZXNzZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhFRCwgMHhBQiwgMHhFRSwgMHhEQl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdycG0nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1ycG0nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhDNSwgMHhEMCwgMHhEMywgMHhDNl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlcHMnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZXBzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MjgsIDB4QjUsIDB4MkYsIDB4RkRdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnenN0Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3pzdGQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg3RiwgMHg0NSwgMHg0QywgMHg0Nl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlbGYnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1lbGYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgyMSwgMHg0MiwgMHg0NCwgMHg0RV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwc3QnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm1zLW91dGxvb2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnUEFSMScpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwYXJxdWV0Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtcGFycXVldCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweENGLCAweEZBLCAweEVELCAweEZFXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ21hY2hvJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbWFjaC1iaW5hcnknLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA1LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEYsIDB4NTQsIDB4NTQsIDB4NEYsIDB4MDBdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnb3RmJyxcblx0XHRcdFx0bWltZTogJ2ZvbnQvb3RmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJyMhQU1SJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FtcicsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9hbXInLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygne1xcXFxydGYnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncnRmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3J0ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ2LCAweDRDLCAweDU2LCAweDAxXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsdicsXG5cdFx0XHRcdG1pbWU6ICd2aWRlby94LWZsdicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJTVBNJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2l0Jyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtaXQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrU3RyaW5nKCctbGgwLScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoMS0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saDItJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbGgzLScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoNC0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saDUtJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbGg2LScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoNy0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1senMtJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbHo0LScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWx6NS0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saGQtJywge29mZnNldDogMn0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdsemgnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1semgtY29tcHJlc3NlZCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE1QRUcgcHJvZ3JhbSBzdHJlYW0gKFBTIG9yIE1QRUctUFMpXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDEsIDB4QkFdKSkge1xuXHRcdFx0Ly8gIE1QRUctUFMsIE1QRUctMSBQYXJ0IDFcblx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDIxXSwge29mZnNldDogNCwgbWFzazogWzB4RjFdfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdtcGcnLCAvLyBNYXkgYWxzbyBiZSAucHMsIC5tcGVnXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL01QMVMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNUEVHLVBTLCBNUEVHLTIgUGFydCAxXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHg0NF0sIHtvZmZzZXQ6IDQsIG1hc2s6IFsweEM0XX0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnbXBnJywgLy8gTWF5IGFsc28gYmUgLm1wZywgLm0ycCwgLnZvYiBvciAuc3ViXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL01QMlAnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJVFNGJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NobScsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtaHRtbGhlbHAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhDQSwgMHhGRSwgMHhCQSwgMHhCRV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdjbGFzcycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi9qYXZhLXZtJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gNi1ieXRlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweEZELCAweDM3LCAweDdBLCAweDU4LCAweDVBLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3h6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gteHonLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnPD94bWwgJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3htbCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94bWwnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgzNywgMHg3QSwgMHhCQywgMHhBRiwgMHgyNywgMHgxQ10pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICc3eicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LTd6LWNvbXByZXNzZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDUyLCAweDYxLCAweDcyLCAweDIxLCAweDFBLCAweDddKVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzZdID09PSAweDAgfHwgdGhpcy5idWZmZXJbNl0gPT09IDB4MSlcblx0XHQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3JhcicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LXJhci1jb21wcmVzc2VkJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ3NvbGlkICcpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzdGwnLFxuXHRcdFx0XHRtaW1lOiAnbW9kZWwvc3RsJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0FDJykpIHtcblx0XHRcdGNvbnN0IHZlcnNpb24gPSB0aGlzLmJ1ZmZlci50b1N0cmluZygnYmluYXJ5JywgMiwgNik7XG5cdFx0XHRpZiAodmVyc2lvbi5tYXRjaCgnXmQqJykgJiYgdmVyc2lvbiA+PSAxMDAwICYmIHZlcnNpb24gPD0gMTA1MCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2R3ZycsXG5cdFx0XHRcdFx0bWltZTogJ2ltYWdlL3ZuZC5kd2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCcwNzA3MDcnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY3BpbycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNwaW8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA3LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0JMRU5ERVInKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYmxlbmQnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1ibGVuZGVyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJyE8YXJjaD4nKSkge1xuXHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSg4KTtcblx0XHRcdGNvbnN0IHN0cmluZyA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoMTMsICdhc2NpaScpKTtcblx0XHRcdGlmIChzdHJpbmcgPT09ICdkZWJpYW4tYmluYXJ5Jykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2RlYicsXG5cdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtZGViJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXInLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC11bml4LWFyY2hpdmUnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnKipBQ0UnLCB7b2Zmc2V0OiA3fSkpIHtcblx0XHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAxNCwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cdFx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnKionLCB7b2Zmc2V0OiAxMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnYWNlJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hY2UtY29tcHJlc3NlZCcsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0gOC1ieXRlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDg5LCAweDUwLCAweDRFLCAweDQ3LCAweDBELCAweDBBLCAweDFBLCAweDBBXSkpIHtcblx0XHRcdC8vIEFQTkcgZm9ybWF0IChodHRwczovL3dpa2kubW96aWxsYS5vcmcvQVBOR19TcGVjaWZpY2F0aW9uKVxuXHRcdFx0Ly8gMS4gRmluZCB0aGUgZmlyc3QgSURBVCAoaW1hZ2UgZGF0YSkgY2h1bmsgKDQ5IDQ0IDQxIDU0KVxuXHRcdFx0Ly8gMi4gQ2hlY2sgaWYgdGhlcmUgaXMgYW4gXCJhY1RMXCIgY2h1bmsgYmVmb3JlIHRoZSBJREFUIG9uZSAoNjEgNjMgNTQgNEMpXG5cblx0XHRcdC8vIE9mZnNldCBjYWxjdWxhdGVkIGFzIGZvbGxvd3M6XG5cdFx0XHQvLyAtIDggYnl0ZXM6IFBORyBzaWduYXR1cmVcblx0XHRcdC8vIC0gNCAobGVuZ3RoKSArIDQgKGNodW5rIHR5cGUpICsgMTMgKGNodW5rIGRhdGEpICsgNCAoQ1JDKTogSUhEUiBjaHVua1xuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDgpOyAvLyBpZ25vcmUgUE5HIHNpZ25hdHVyZVxuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkQ2h1bmtIZWFkZXIoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGVuZ3RoOiBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKFRva2VuLklOVDMyX0JFKSxcblx0XHRcdFx0XHR0eXBlOiBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKG5ldyBUb2tlbi5TdHJpbmdUeXBlKDQsICdiaW5hcnknKSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGRvIHtcblx0XHRcdFx0Y29uc3QgY2h1bmsgPSBhd2FpdCByZWFkQ2h1bmtIZWFkZXIoKTtcblx0XHRcdFx0aWYgKGNodW5rLmxlbmd0aCA8IDApIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIEludmFsaWQgY2h1bmsgbGVuZ3RoXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzd2l0Y2ggKGNodW5rLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdJREFUJzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ3BuZycsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjYXNlICdhY1RMJzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FwbmcnLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UvYXBuZycsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGNodW5rLmxlbmd0aCArIDQpOyAvLyBJZ25vcmUgY2h1bmstZGF0YSArIENSQ1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlICh0b2tlbml6ZXIucG9zaXRpb24gKyA4IDwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwbmcnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvcG5nJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDEsIDB4NTIsIDB4NTIsIDB4NEYsIDB4NTcsIDB4MzEsIDB4MDAsIDB4MDBdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXJyb3cnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hcGFjaGUtYXJyb3cnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg2NywgMHg2QywgMHg1NCwgMHg0NiwgMHgwMiwgMHgwMCwgMHgwMCwgMHgwMF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdnbGInLFxuXHRcdFx0XHRtaW1lOiAnbW9kZWwvZ2x0Zi1iaW5hcnknLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBgbW92YCBmb3JtYXQgdmFyaWFudHNcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDY2LCAweDcyLCAweDY1LCAweDY1XSwge29mZnNldDogNH0pIC8vIGBmcmVlYFxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHg2RCwgMHg2NCwgMHg2MSwgMHg3NF0sIHtvZmZzZXQ6IDR9KSAvLyBgbWRhdGAgTUpQRUdcblx0XHRcdHx8IHRoaXMuY2hlY2soWzB4NkQsIDB4NkYsIDB4NkYsIDB4NzZdLCB7b2Zmc2V0OiA0fSkgLy8gYG1vb3ZgXG5cdFx0XHR8fCB0aGlzLmNoZWNrKFsweDc3LCAweDY5LCAweDY0LCAweDY1XSwge29mZnNldDogNH0pIC8vIGB3aWRlYFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbW92Jyxcblx0XHRcdFx0bWltZTogJ3ZpZGVvL3F1aWNrdGltZScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIC0tIDktYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0OSwgMHg0OSwgMHg1MiwgMHg0RiwgMHgwOCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgxOF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdvcmYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1vbHltcHVzLW9yZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdnaW1wIHhjZiAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAneGNmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3gteGNmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gMTItYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0OSwgMHg0OSwgMHg1NSwgMHgwMCwgMHgxOCwgMHgwMCwgMHgwMCwgMHgwMCwgMHg4OCwgMHhFNywgMHg3NCwgMHhEOF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdydzInLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1wYW5hc29uaWMtcncyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQVNGX0hlYWRlcl9PYmplY3QgZmlyc3QgODAgYnl0ZXNcblx0XHRpZiAodGhpcy5jaGVjayhbMHgzMCwgMHgyNiwgMHhCMiwgMHg3NSwgMHg4RSwgMHg2NiwgMHhDRiwgMHgxMSwgMHhBNiwgMHhEOV0pKSB7XG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkSGVhZGVyKCkge1xuXHRcdFx0XHRjb25zdCBndWlkID0gQnVmZmVyLmFsbG9jKDE2KTtcblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIoZ3VpZCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IGd1aWQsXG5cdFx0XHRcdFx0c2l6ZTogTnVtYmVyKGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4oVG9rZW4uVUlOVDY0X0xFKSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoMzApO1xuXHRcdFx0Ly8gU2VhcmNoIGZvciBoZWFkZXIgc2hvdWxkIGJlIGluIGZpcnN0IDFLQiBvZiBmaWxlLlxuXHRcdFx0d2hpbGUgKHRva2VuaXplci5wb3NpdGlvbiArIDI0IDwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpIHtcblx0XHRcdFx0Y29uc3QgaGVhZGVyID0gYXdhaXQgcmVhZEhlYWRlcigpO1xuXHRcdFx0XHRsZXQgcGF5bG9hZCA9IGhlYWRlci5zaXplIC0gMjQ7XG5cdFx0XHRcdGlmIChfY2hlY2soaGVhZGVyLmlkLCBbMHg5MSwgMHgwNywgMHhEQywgMHhCNywgMHhCNywgMHhBOSwgMHhDRiwgMHgxMSwgMHg4RSwgMHhFNiwgMHgwMCwgMHhDMCwgMHgwQywgMHgyMCwgMHg1MywgMHg2NV0pKSB7XG5cdFx0XHRcdFx0Ly8gU3luYyBvbiBTdHJlYW0tUHJvcGVydGllcy1PYmplY3QgKEI3REMwNzkxLUE5QjctMTFDRi04RUU2LTAwQzAwQzIwNTM2NSlcblx0XHRcdFx0XHRjb25zdCB0eXBlSWQgPSBCdWZmZXIuYWxsb2MoMTYpO1xuXHRcdFx0XHRcdHBheWxvYWQgLT0gYXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIodHlwZUlkKTtcblxuXHRcdFx0XHRcdGlmIChfY2hlY2sodHlwZUlkLCBbMHg0MCwgMHg5RSwgMHg2OSwgMHhGOCwgMHg0RCwgMHg1QiwgMHhDRiwgMHgxMSwgMHhBOCwgMHhGRCwgMHgwMCwgMHg4MCwgMHg1RiwgMHg1QywgMHg0NCwgMHgyQl0pKSB7XG5cdFx0XHRcdFx0XHQvLyBGb3VuZCBhdWRpbzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdhdWRpby94LW1zLWFzZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChfY2hlY2sodHlwZUlkLCBbMHhDMCwgMHhFRiwgMHgxOSwgMHhCQywgMHg0RCwgMHg1QiwgMHhDRiwgMHgxMSwgMHhBOCwgMHhGRCwgMHgwMCwgMHg4MCwgMHg1RiwgMHg1QywgMHg0NCwgMHgyQl0pKSB7XG5cdFx0XHRcdFx0XHQvLyBGb3VuZCB2aWRlbzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby94LW1zLWFzZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZShwYXlsb2FkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVmYXVsdCB0byBBU0YgZ2VuZXJpYyBleHRlbnNpb25cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtYXNmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4QUIsIDB4NEIsIDB4NTQsIDB4NTgsIDB4MjAsIDB4MzEsIDB4MzEsIDB4QkIsIDB4MEQsIDB4MEEsIDB4MUEsIDB4MEFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAna3R4Jyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2t0eCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICgodGhpcy5jaGVjayhbMHg3RSwgMHgxMCwgMHgwNF0pIHx8IHRoaXMuY2hlY2soWzB4N0UsIDB4MTgsIDB4MDRdKSkgJiYgdGhpcy5jaGVjayhbMHgzMCwgMHg0RCwgMHg0OSwgMHg0NV0sIHtvZmZzZXQ6IDR9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbWllJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbWllJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MjcsIDB4MEEsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDBdLCB7b2Zmc2V0OiAyfSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3NocCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWVzcmktc2hhcGUnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhGRiwgMHg0RiwgMHhGRiwgMHg1MV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqMmMnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvajJjJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDAsIDB4MEMsIDB4NkEsIDB4NTAsIDB4MjAsIDB4MjAsIDB4MEQsIDB4MEEsIDB4ODcsIDB4MEFdKSkge1xuXHRcdFx0Ly8gSlBFRy0yMDAwIGZhbWlseVxuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDIwKTtcblx0XHRcdGNvbnN0IHR5cGUgPSBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKG5ldyBUb2tlbi5TdHJpbmdUeXBlKDQsICdhc2NpaScpKTtcblx0XHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0XHRjYXNlICdqcDIgJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnanAyJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9qcDInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdGNhc2UgJ2pweCAnOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRleHQ6ICdqcHgnLFxuXHRcdFx0XHRcdFx0bWltZTogJ2ltYWdlL2pweCcsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSAnanBtICc6XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2pwbScsXG5cdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UvanBtJyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRjYXNlICdtanAyJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbWoyJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9tajInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4RkYsIDB4MEFdKVxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwMCwgMHgwMCwgMHgwMCwgMHgwQywgMHg0QSwgMHg1OCwgMHg0QywgMHgyMCwgMHgwRCwgMHgwQSwgMHg4NywgMHgwQV0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqeGwnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvanhsJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkUsIDB4RkZdKSkgeyAvLyBVVEYtMTYtQk9NLUxFXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMCwgNjAsIDAsIDYzLCAwLCAxMjAsIDAsIDEwOSwgMCwgMTA4XSwge29mZnNldDogMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAneG1sJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veG1sJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gU29tZSB1bmtub3duIHRleHQgYmFzZWQgZm9ybWF0XG5cdFx0fVxuXG5cdFx0Ly8gLS0gVW5zYWZlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4MCwgMHgwLCAweDEsIDB4QkFdKVxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwLCAweDAsIDB4MSwgMHhCM10pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtcGcnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXBlZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDAxLCAweDAwLCAweDAwLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3R0ZicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3R0ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDAwLCAweDAxLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ljbycsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS94LWljb24nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgwMCwgMHgwMCwgMHgwMiwgMHgwMF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdjdXInLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1pY29uJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RDAsIDB4Q0YsIDB4MTEsIDB4RTAsIDB4QTEsIDB4QjEsIDB4MUEsIDB4RTFdKSkge1xuXHRcdFx0Ly8gRGV0ZWN0ZWQgTWljcm9zb2Z0IENvbXBvdW5kIEZpbGUgQmluYXJ5IEZpbGUgKE1TLUNGQikgRm9ybWF0LlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY2ZiJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtY2ZiJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSW5jcmVhc2Ugc2FtcGxlIHNpemUgZnJvbSAxMiB0byAyNTYuXG5cdFx0YXdhaXQgdG9rZW5pemVyLnBlZWtCdWZmZXIodGhpcy5idWZmZXIsIHtsZW5ndGg6IE1hdGgubWluKDI1NiwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpLCBtYXlCZUxlc3M6IHRydWV9KTtcblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDYxLCAweDYzLCAweDczLCAweDcwXSwge29mZnNldDogMzZ9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnaWNjJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5pY2Nwcm9maWxlJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gMTUtYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnQkVHSU46JykpIHtcblx0XHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdWQ0FSRCcsIHtvZmZzZXQ6IDZ9KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ3ZjZicsXG5cdFx0XHRcdFx0bWltZTogJ3RleHQvdmNhcmQnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnVkNBTEVOREFSJywge29mZnNldDogNn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnaWNzJyxcblx0XHRcdFx0XHRtaW1lOiAndGV4dC9jYWxlbmRhcicsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYHJhZmAgaXMgaGVyZSBqdXN0IHRvIGtlZXAgYWxsIHRoZSByYXcgaW1hZ2UgZGV0ZWN0b3JzIHRvZ2V0aGVyLlxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGVUpJRklMTUNDRC1SQVcnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncmFmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3gtZnVqaWZpbG0tcmFmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0V4dGVuZGVkIE1vZHVsZTonKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAneG0nLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC14bScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdDcmVhdGl2ZSBWb2ljZSBGaWxlJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3ZvYycsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby94LXZvYycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDA0LCAweDAwLCAweDAwLCAweDAwXSkgJiYgdGhpcy5idWZmZXIubGVuZ3RoID49IDE2KSB7IC8vIFJvdWdoICYgcXVpY2sgY2hlY2sgUGlja2xlL0FTQVJcblx0XHRcdGNvbnN0IGpzb25TaXplID0gdGhpcy5idWZmZXIucmVhZFVJbnQzMkxFKDEyKTtcblx0XHRcdGlmIChqc29uU2l6ZSA+IDEyICYmIHRoaXMuYnVmZmVyLmxlbmd0aCA+PSBqc29uU2l6ZSArIDE2KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZGVyID0gdGhpcy5idWZmZXIuc2xpY2UoMTYsIGpzb25TaXplICsgMTYpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QganNvbiA9IEpTT04ucGFyc2UoaGVhZGVyKTtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiBQaWNrbGUgaXMgQVNBUlxuXHRcdFx0XHRcdGlmIChqc29uLmZpbGVzKSB7IC8vIEZpbmFsIGNoZWNrLCBhc3N1cmluZyBQaWNrbGUvQVNBUiBmb3JtYXRcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzYXInLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hc2FyJyxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHt9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDYsIDB4MEUsIDB4MkIsIDB4MzQsIDB4MDIsIDB4MDUsIDB4MDEsIDB4MDEsIDB4MEQsIDB4MDEsIDB4MDIsIDB4MDEsIDB4MDEsIDB4MDJdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbXhmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL214ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdTQ1JNJywge29mZnNldDogNDR9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnczNtJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtczNtJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gUmF3IE1QRUctMiB0cmFuc3BvcnQgc3RyZWFtICgxODgtYnl0ZSBwYWNrZXRzKVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ3XSkgJiYgdGhpcy5jaGVjayhbMHg0N10sIHtvZmZzZXQ6IDE4OH0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtdHMnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXAydCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEJsdS1yYXkgRGlzYyBBdWRpby1WaWRlbyAoQkRBVikgTVBFRy0yIHRyYW5zcG9ydCBzdHJlYW0gaGFzIDQtYnl0ZSBUUF9leHRyYV9oZWFkZXIgYmVmb3JlIGVhY2ggMTg4LWJ5dGUgcGFja2V0XG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDddLCB7b2Zmc2V0OiA0fSkgJiYgdGhpcy5jaGVjayhbMHg0N10sIHtvZmZzZXQ6IDE5Nn0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtdHMnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXAydCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQyLCAweDRGLCAweDRGLCAweDRCLCAweDRELCAweDRGLCAweDQyLCAweDQ5XSwge29mZnNldDogNjB9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbW9iaScsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LW1vYmlwb2NrZXQtZWJvb2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0NCwgMHg0OSwgMHg0MywgMHg0RF0sIHtvZmZzZXQ6IDEyOH0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdkY20nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZGljb20nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0QywgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMSwgMHgxNCwgMHgwMiwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHhDMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHg0Nl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdsbmsnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC5tcy5zaG9ydGN1dCcsIC8vIEludmVudGVkIGJ5IHVzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDYyLCAweDZGLCAweDZGLCAweDZCLCAweDAwLCAweDAwLCAweDAwLCAweDAwLCAweDZELCAweDYxLCAweDcyLCAweDZCLCAweDAwLCAweDAwLCAweDAwLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FsaWFzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3guYXBwbGUuYWxpYXMnLCAvLyBJbnZlbnRlZCBieSB1c1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnS2F5ZGFyYSBGQlggQmluYXJ5ICBcXHUwMDAwJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZieCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LmF1dG9kZXNrLmZieCcsIC8vIEludmVudGVkIGJ5IHVzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4NEMsIDB4NTBdLCB7b2Zmc2V0OiAzNH0pXG5cdFx0XHQmJiAoXG5cdFx0XHRcdHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDFdLCB7b2Zmc2V0OiA4fSlcblx0XHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwMSwgMHgwMCwgMHgwMl0sIHtvZmZzZXQ6IDh9KVxuXHRcdFx0XHR8fCB0aGlzLmNoZWNrKFsweDAyLCAweDAwLCAweDAyXSwge29mZnNldDogOH0pXG5cdFx0XHQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlb3QnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm1zLWZvbnRvYmplY3QnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgwNiwgMHgwNiwgMHhFRCwgMHhGNSwgMHhEOCwgMHgxRCwgMHg0NiwgMHhFNSwgMHhCRCwgMHgzMSwgMHhFRiwgMHhFNywgMHhGRSwgMHg3NCwgMHhCNywgMHgxRF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdpbmRkJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtaW5kZXNpZ24nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBJbmNyZWFzZSBzYW1wbGUgc2l6ZSBmcm9tIDI1NiB0byA1MTJcblx0XHRhd2FpdCB0b2tlbml6ZXIucGVla0J1ZmZlcih0aGlzLmJ1ZmZlciwge2xlbmd0aDogTWF0aC5taW4oNTEyLCB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSksIG1heUJlTGVzczogdHJ1ZX0pO1xuXG5cdFx0Ly8gUmVxdWlyZXMgYSBidWZmZXIgc2l6ZSBvZiA1MTIgYnl0ZXNcblx0XHRpZiAodGFySGVhZGVyQ2hlY2tzdW1NYXRjaGVzKHRoaXMuYnVmZmVyKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAndGFyJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtdGFyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4RkVdKSkgeyAvLyBVVEYtMTYtQk9NLUJFXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbNjAsIDAsIDYzLCAwLCAxMjAsIDAsIDEwOSwgMCwgMTA4LCAwXSwge29mZnNldDogMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAneG1sJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veG1sJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4MEUsIDB4NTMsIDB4MDAsIDB4NkIsIDB4MDAsIDB4NjUsIDB4MDAsIDB4NzQsIDB4MDAsIDB4NjMsIDB4MDAsIDB4NjgsIDB4MDAsIDB4NTUsIDB4MDAsIDB4NzAsIDB4MDAsIDB4MjAsIDB4MDAsIDB4NEQsIDB4MDAsIDB4NkYsIDB4MDAsIDB4NjQsIDB4MDAsIDB4NjUsIDB4MDAsIDB4NkMsIDB4MDBdLCB7b2Zmc2V0OiAyfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdza3AnLFxuXHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuc2tldGNodXAuc2twJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gU29tZSB0ZXh0IGJhc2VkIGZvcm1hdFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCctLS0tLUJFR0lOIFBHUCBNRVNTQUdFLS0tLS0nKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncGdwJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3BncC1lbmNyeXB0ZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBNUEVHIDEgb3IgMiBMYXllciAzIGhlYWRlciwgb3IgJ2xheWVyIDAnIGZvciBBRFRTIChNUEVHIHN5bmMtd29yZCAweEZGRSlcblx0XHRpZiAodGhpcy5idWZmZXIubGVuZ3RoID49IDIgJiYgdGhpcy5jaGVjayhbMHhGRiwgMHhFMF0sIHtvZmZzZXQ6IDAsIG1hc2s6IFsweEZGLCAweEUwXX0pKSB7XG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHgxMF0sIHtvZmZzZXQ6IDEsIG1hc2s6IFsweDE2XX0pKSB7XG5cdFx0XHRcdC8vIENoZWNrIGZvciAoQURUUykgTVBFRy0yXG5cdFx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDA4XSwge29mZnNldDogMSwgbWFzazogWzB4MDhdfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnYWFjJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdhdWRpby9hYWMnLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBNdXN0IGJlIChBRFRTKSBNUEVHLTRcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdhYWMnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9hYWMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNUEVHIDEgb3IgMiBMYXllciAzIGhlYWRlclxuXHRcdFx0Ly8gQ2hlY2sgZm9yIE1QRUcgbGF5ZXIgM1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4MDJdLCB7b2Zmc2V0OiAxLCBtYXNrOiBbMHgwNl19KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ21wMycsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL21wZWcnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmb3IgTVBFRyBsYXllciAyXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHgwNF0sIHtvZmZzZXQ6IDEsIG1hc2s6IFsweDA2XX0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnbXAyJyxcblx0XHRcdFx0XHRtaW1lOiAnYXVkaW8vbXBlZycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBNUEVHIGxheWVyIDFcblx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDA2XSwge29mZnNldDogMSwgbWFzazogWzB4MDZdfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdtcDEnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9tcGVnJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkVGlmZlRhZyhiaWdFbmRpYW4pIHtcblx0XHRjb25zdCB0YWdJZCA9IGF3YWl0IHRoaXMudG9rZW5pemVyLnJlYWRUb2tlbihiaWdFbmRpYW4gPyBUb2tlbi5VSU5UMTZfQkUgOiBUb2tlbi5VSU5UMTZfTEUpO1xuXHRcdHRoaXMudG9rZW5pemVyLmlnbm9yZSgxMCk7XG5cdFx0c3dpdGNoICh0YWdJZCkge1xuXHRcdFx0Y2FzZSA1MF8zNDE6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnYXJ3Jyxcblx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1zb255LWFydycsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIDUwXzcwNjpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdkbmcnLFxuXHRcdFx0XHRcdG1pbWU6ICdpbWFnZS94LWFkb2JlLWRuZycsXG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWRUaWZmSUZEKGJpZ0VuZGlhbikge1xuXHRcdGNvbnN0IG51bWJlck9mVGFncyA9IGF3YWl0IHRoaXMudG9rZW5pemVyLnJlYWRUb2tlbihiaWdFbmRpYW4gPyBUb2tlbi5VSU5UMTZfQkUgOiBUb2tlbi5VSU5UMTZfTEUpO1xuXHRcdGZvciAobGV0IG4gPSAwOyBuIDwgbnVtYmVyT2ZUYWdzOyArK24pIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZlRhZyhiaWdFbmRpYW4pO1xuXHRcdFx0aWYgKGZpbGVUeXBlKSB7XG5cdFx0XHRcdHJldHVybiBmaWxlVHlwZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkVGlmZkhlYWRlcihiaWdFbmRpYW4pIHtcblx0XHRjb25zdCB2ZXJzaW9uID0gKGJpZ0VuZGlhbiA/IFRva2VuLlVJTlQxNl9CRSA6IFRva2VuLlVJTlQxNl9MRSkuZ2V0KHRoaXMuYnVmZmVyLCAyKTtcblx0XHRjb25zdCBpZmRPZmZzZXQgPSAoYmlnRW5kaWFuID8gVG9rZW4uVUlOVDMyX0JFIDogVG9rZW4uVUlOVDMyX0xFKS5nZXQodGhpcy5idWZmZXIsIDQpO1xuXG5cdFx0aWYgKHZlcnNpb24gPT09IDQyKSB7XG5cdFx0XHQvLyBUSUZGIGZpbGUgaGVhZGVyXG5cdFx0XHRpZiAoaWZkT2Zmc2V0ID49IDYpIHtcblx0XHRcdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0NSJywge29mZnNldDogOH0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2NyMicsXG5cdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1jYW5vbi1jcjInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaWZkT2Zmc2V0ID49IDggJiYgKHRoaXMuY2hlY2soWzB4MUMsIDB4MDAsIDB4RkUsIDB4MDBdLCB7b2Zmc2V0OiA4fSkgfHwgdGhpcy5jaGVjayhbMHgxRiwgMHgwMCwgMHgwQiwgMHgwMF0sIHtvZmZzZXQ6IDh9KSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbmVmJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS94LW5pa29uLW5lZicsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnRva2VuaXplci5pZ25vcmUoaWZkT2Zmc2V0KTtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZklGRChiaWdFbmRpYW4pO1xuXHRcdFx0cmV0dXJuIGZpbGVUeXBlID8/IHtcblx0XHRcdFx0ZXh0OiAndGlmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3RpZmYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodmVyc2lvbiA9PT0gNDMpIHtcdC8vIEJpZyBUSUZGIGZpbGUgaGVhZGVyXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICd0aWYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvdGlmZicsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVTdHJlYW0ocmVhZGFibGVTdHJlYW0sIG9wdGlvbnMgPSB7fSkge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkudG9EZXRlY3Rpb25TdHJlYW0ocmVhZGFibGVTdHJlYW0sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgY29uc3Qgc3VwcG9ydGVkRXh0ZW5zaW9ucyA9IG5ldyBTZXQoZXh0ZW5zaW9ucyk7XG5leHBvcnQgY29uc3Qgc3VwcG9ydGVkTWltZVR5cGVzID0gbmV3IFNldChtaW1lVHlwZXMpO1xuIiwiaW1wb3J0IHtmaWxlVHlwZUZyb21CdWZmZXJ9IGZyb20gJ2ZpbGUtdHlwZSc7XG5cbmNvbnN0IGltYWdlRXh0ZW5zaW9ucyA9IG5ldyBTZXQoW1xuXHQnanBnJyxcblx0J3BuZycsXG5cdCdnaWYnLFxuXHQnd2VicCcsXG5cdCdmbGlmJyxcblx0J2NyMicsXG5cdCd0aWYnLFxuXHQnYm1wJyxcblx0J2p4cicsXG5cdCdwc2QnLFxuXHQnaWNvJyxcblx0J2JwZycsXG5cdCdqcDInLFxuXHQnanBtJyxcblx0J2pweCcsXG5cdCdoZWljJyxcblx0J2N1cicsXG5cdCdkY20nLFxuXHQnYXZpZicsXG5dKTtcblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gaW1hZ2VUeXBlKGlucHV0KSB7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUeXBlRnJvbUJ1ZmZlcihpbnB1dCk7XG5cdHJldHVybiBpbWFnZUV4dGVuc2lvbnMuaGFzKHJlc3VsdD8uZXh0KSAmJiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjb25zdCBtaW5pbXVtQnl0ZXMgPSA0MTAwO1xuIiwiLy8g2KfZhNi52LHYqNmK2KlcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyDEjWXFoXRpbmFcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBEYW5za1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIERldXRzY2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9OyIsIi8vIEVuZ2xpc2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICAvLyBzZXR0aW5nLnRzXHJcbiAgXCJQbHVnaW4gU2V0dGluZ3NcIjogXCJQbHVnaW4gU2V0dGluZ3NcIixcclxuICBcIkF1dG8gcGFzdGVkIHVwbG9hZFwiOiBcIkF1dG8gcGFzdGVkIHVwbG9hZFwiLFxyXG4gIFwiSWYgeW91IHNldCB0aGlzIHZhbHVlIHRydWUsIHdoZW4geW91IHBhc3RlIGltYWdlLCBpdCB3aWxsIGJlIGF1dG8gdXBsb2FkZWQoeW91IHNob3VsZCBzZXQgdGhlIHBpY0dvIHNlcnZlciByaWdodGx5KVwiOlxyXG4gICAgXCJJZiB5b3Ugc2V0IHRoaXMgdmFsdWUgdHJ1ZSwgd2hlbiB5b3UgcGFzdGUgaW1hZ2UsIGl0IHdpbGwgYmUgYXV0byB1cGxvYWRlZCh5b3Ugc2hvdWxkIHNldCB0aGUgcGljR28gc2VydmVyIHJpZ2h0bHkpXCIsXHJcbiAgXCJEZWZhdWx0IHVwbG9hZGVyXCI6IFwiRGVmYXVsdCB1cGxvYWRlclwiLFxyXG4gIFwiUGljR28gc2VydmVyXCI6IFwiUGljR28gc2VydmVyIHVwbG9hZCByb3V0ZVwiLFxyXG4gIFwiUGljR28gc2VydmVyIGRlc2NcIjpcclxuICAgIFwidXBsb2FkIHJvdXRlLCB1c2UgUGljTGlzdCB3aWxsIGJlIGFibGUgdG8gc2V0IHBpY2JlZCBhbmQgY29uZmlnIHRocm91Z2ggcXVlcnlcIixcclxuICBcIlBsZWFzZSBpbnB1dCBQaWNHbyBzZXJ2ZXJcIjogXCJQbGVhc2UgaW5wdXQgdXBsb2FkIHJvdXRlXCIsXHJcbiAgXCJQaWNHbyBkZWxldGUgc2VydmVyXCI6XHJcbiAgICBcIlBpY0dvIHNlcnZlciBkZWxldGUgcm91dGUoeW91IG5lZWQgdG8gdXNlIFBpY0xpc3QgYXBwKVwiLFxyXG4gIFwiUGljTGlzdCBkZXNjXCI6IFwiU2VhcmNoIFBpY0xpc3Qgb24gR2l0aHViIHRvIGRvd25sb2FkIGFuZCBpbnN0YWxsXCIsXHJcbiAgXCJQbGVhc2UgaW5wdXQgUGljR28gZGVsZXRlIHNlcnZlclwiOiBcIlBsZWFzZSBpbnB1dCBkZWxldGUgc2VydmVyXCIsXHJcbiAgXCJEZWxldGUgaW1hZ2UgdXNpbmcgUGljTGlzdFwiOiBcIkRlbGV0ZSBpbWFnZSB1c2luZyBQaWNMaXN0XCIsXHJcbiAgXCJQaWNHby1Db3JlIHBhdGhcIjogXCJQaWNHby1Db3JlIHBhdGhcIixcclxuICBcIkRlbGV0ZSBzdWNjZXNzZnVsbHlcIjogXCJEZWxldGUgc3VjY2Vzc2Z1bGx5XCIsXHJcbiAgXCJEZWxldGUgZmFpbGVkXCI6IFwiRGVsZXRlIGZhaWxlZFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXhcIjogXCJJbWFnZSBzaXplIHN1ZmZpeFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXggRGVzY3JpcHRpb25cIjogXCJsaWtlIHwzMDAgZm9yIHJlc2l6ZSBpbWFnZSBpbiBvYi5cIixcclxuICBcIlBsZWFzZSBpbnB1dCBpbWFnZSBzaXplIHN1ZmZpeFwiOiBcIlBsZWFzZSBpbnB1dCBpbWFnZSBzaXplIHN1ZmZpeFwiLFxyXG4gIFwiRXJyb3IsIGNvdWxkIG5vdCBkZWxldGVcIjogXCJFcnJvciwgY291bGQgbm90IGRlbGV0ZVwiLFxyXG4gIFwiUGxlYXNlIGlucHV0IFBpY0dvLUNvcmUgcGF0aCwgZGVmYXVsdCB1c2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIjpcclxuICAgIFwiUGxlYXNlIGlucHV0IFBpY0dvLUNvcmUgcGF0aCwgZGVmYXVsdCB1c2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIixcclxuICBcIldvcmsgb24gbmV0d29ya1wiOiBcIldvcmsgb24gbmV0d29ya1wiLFxyXG4gIFwiV29yayBvbiBuZXR3b3JrIERlc2NyaXB0aW9uXCI6XHJcbiAgICBcIkFsbG93IHVwbG9hZCBuZXR3b3JrIGltYWdlIGJ5ICdVcGxvYWQgYWxsJyBjb21tYW5kLlxcbiBPciB3aGVuIHlvdSBwYXN0ZSwgbWQgc3RhbmRhcmQgaW1hZ2UgbGluayBpbiB5b3VyIGNsaXBib2FyZCB3aWxsIGJlIGF1dG8gdXBsb2FkLlwiLFxyXG4gIFwiVXBsb2FkIHdoZW4gY2xpcGJvYXJkIGhhcyBpbWFnZSBhbmQgdGV4dCB0b2dldGhlclwiOlxyXG4gICAgXCJVcGxvYWQgd2hlbiBjbGlwYm9hcmQgaGFzIGltYWdlIGFuZCB0ZXh0IHRvZ2V0aGVyXCIsXHJcbiAgXCJXaGVuIHlvdSBjb3B5LCBzb21lIGFwcGxpY2F0aW9uIGxpa2UgRXhjZWwgd2lsbCBpbWFnZSBhbmQgdGV4dCB0byBjbGlwYm9hcmQsIHlvdSBjYW4gdXBsb2FkIG9yIG5vdC5cIjpcclxuICAgIFwiV2hlbiB5b3UgY29weSwgc29tZSBhcHBsaWNhdGlvbiBsaWtlIEV4Y2VsIHdpbGwgaW1hZ2UgYW5kIHRleHQgdG8gY2xpcGJvYXJkLCB5b3UgY2FuIHVwbG9hZCBvciBub3QuXCIsXHJcbiAgXCJOZXR3b3JrIERvbWFpbiBCbGFjayBMaXN0XCI6IFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdFwiLFxyXG4gIFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdCBEZXNjcmlwdGlvblwiOlxyXG4gICAgXCJJbWFnZSBpbiB0aGUgZG9tYWluIGxpc3Qgd2lsbCBub3QgYmUgdXBsb2FkLHVzZSBjb21tYSBzZXBhcmF0ZWRcIixcclxuICBcIkRlbGV0ZSBzb3VyY2UgZmlsZSBhZnRlciB5b3UgdXBsb2FkIGZpbGVcIjpcclxuICAgIFwiRGVsZXRlIHNvdXJjZSBmaWxlIGFmdGVyIHlvdSB1cGxvYWQgZmlsZVwiLFxyXG4gIFwiRGVsZXRlIHNvdXJjZSBmaWxlIGluIG9iIGFzc2V0cyBhZnRlciB5b3UgdXBsb2FkIGZpbGUuXCI6XHJcbiAgICBcIkRlbGV0ZSBzb3VyY2UgZmlsZSBpbiBvYiBhc3NldHMgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlLlwiLFxyXG4gIFwiSW1hZ2UgZGVzY1wiOiBcIkltYWdlIGRlc2NcIixcclxuICByZXNlcnZlOiBcImRlZmF1bHRcIixcclxuICBcInJlbW92ZSBhbGxcIjogXCJub25lXCIsXHJcbiAgXCJyZW1vdmUgZGVmYXVsdFwiOiBcInJlbW92ZSBpbWFnZS5wbmdcIixcclxuICBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiOiBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiLFxyXG4gIFwiUmVtb3RlIHNlcnZlciBtb2RlIGRlc2NcIjpcclxuICAgIFwiSWYgeW91IGhhdmUgZGVwbG95ZWQgcGljbGlzdC1jb3JlIG9yIHBpY2xpc3Qgb24gdGhlIHNlcnZlci5cIixcclxuICBcIkNhbiBub3QgZmluZCBpbWFnZSBmaWxlXCI6IFwiQ2FuIG5vdCBmaW5kIGltYWdlIGZpbGVcIixcclxuICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIHVwbG9hZCBmYWlsdXJlXCI6XHJcbiAgICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIHVwbG9hZCBmYWlsdXJlXCIsXHJcbiAgXCJGaWxlIGhhcyBiZWVuIGNoYW5nZWRkLCBkb3dubG9hZCBmYWlsdXJlXCI6XHJcbiAgICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIGRvd25sb2FkIGZhaWx1cmVcIixcclxuICBcIldhcm5pbmc6IHVwbG9hZCBmaWxlcyBpcyBkaWZmZXJlbnQgb2YgcmVjaXZlciBmaWxlcyBmcm9tIGFwaVwiOlxyXG4gICAgXCJXYXJuaW5nOiB1cGxvYWQgZmlsZXMgbnVtIGlzIGRpZmZlcmVudCBvZiByZWNpdmVyIGZpbGVzIGZyb20gYXBpXCIsXHJcbiAgdXBsb2FkOiBcIlVwbG9hZFwiLFxyXG59O1xyXG4iLCIvLyBCcml0aXNoIEVuZ2xpc2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBFc3Bhw7FvbFxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIGZyYW7Dp2Fpc1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIOCkueCkv+CkqOCljeCkpuClgFxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIEJhaGFzYSBJbmRvbmVzaWFcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBJdGFsaWFub1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIOaXpeacrOiqnlxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307IiwiLy8g7ZWc6rWt7Ja0XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8gTmVkZXJsYW5kc1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIE5vcnNrXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8gasSZenlrIHBvbHNraVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIFBvcnR1Z3XDqnNcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBQb3J0dWd1w6pzIGRvIEJyYXNpbFxyXG4vLyBCcmF6aWxpYW4gUG9ydHVndWVzZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307IiwiLy8gUm9tw6JuxINcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyDRgNGD0YHRgdC60LjQuVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIFTDvHJrw6dlXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8g566A5L2T5Lit5paHXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgLy8gc2V0dGluZy50c1xyXG4gIFwiUGx1Z2luIFNldHRpbmdzXCI6IFwi5o+S5Lu26K6+572uXCIsXHJcbiAgXCJBdXRvIHBhc3RlZCB1cGxvYWRcIjogXCLliarliIfmnb/oh6rliqjkuIrkvKBcIixcclxuICBcIklmIHlvdSBzZXQgdGhpcyB2YWx1ZSB0cnVlLCB3aGVuIHlvdSBwYXN0ZSBpbWFnZSwgaXQgd2lsbCBiZSBhdXRvIHVwbG9hZGVkKHlvdSBzaG91bGQgc2V0IHRoZSBwaWNHbyBzZXJ2ZXIgcmlnaHRseSlcIjpcclxuICAgIFwi5ZCv55So6K+l6YCJ6aG55ZCO77yM6buP6LS05Zu+54mH5pe25Lya6Ieq5Yqo5LiK5Lyg77yI5L2g6ZyA6KaB5q2j56Gu6YWN572ucGljZ2/vvIlcIixcclxuICBcIkRlZmF1bHQgdXBsb2FkZXJcIjogXCLpu5jorqTkuIrkvKDlmahcIixcclxuICBcIlBpY0dvIHNlcnZlclwiOiBcIlBpY0dvIHNlcnZlciDkuIrkvKDmjqXlj6NcIixcclxuICBcIlBpY0dvIHNlcnZlciBkZXNjXCI6IFwi5LiK5Lyg5o6l5Y+j77yM5L2/55SoUGljTGlzdOaXtuWPr+mAmui/h+iuvue9rlVSTOWPguaVsOaMh+WumuWbvuW6iuWSjOmFjee9rlwiLFxyXG4gIFwiUGxlYXNlIGlucHV0IFBpY0dvIHNlcnZlclwiOiBcIuivt+i+k+WFpeS4iuS8oOaOpeWPo+WcsOWdgFwiLFxyXG4gIFwiUGljR28gZGVsZXRlIHNlcnZlclwiOiBcIlBpY0dvIHNlcnZlciDliKDpmaTmjqXlj6Mo6K+35L2/55SoUGljTGlzdOadpeWQr+eUqOatpOWKn+iDvSlcIixcclxuICBcIlBpY0xpc3QgZGVzY1wiOiBcIlBpY0xpc3TmmK9QaWNHb+S6jOasoeW8gOWPkeeJiO+8jOivt0dpdGh1YuaQnOe0olBpY0xpc3TkuIvovb1cIixcclxuICBcIlBsZWFzZSBpbnB1dCBQaWNHbyBkZWxldGUgc2VydmVyXCI6IFwi6K+36L6T5YWl5Yig6Zmk5o6l5Y+j5Zyw5Z2AXCIsXHJcbiAgXCJEZWxldGUgaW1hZ2UgdXNpbmcgUGljTGlzdFwiOiBcIuS9v+eUqCBQaWNMaXN0IOWIoOmZpOWbvueJh1wiLFxyXG4gIFwiUGljR28tQ29yZSBwYXRoXCI6IFwiUGljR28tQ29yZSDot6/lvoRcIixcclxuICBcIkRlbGV0ZSBzdWNjZXNzZnVsbHlcIjogXCLliKDpmaTmiJDlip9cIixcclxuICBcIkRlbGV0ZSBmYWlsZWRcIjogXCLliKDpmaTlpLHotKVcIixcclxuICBcIkVycm9yLCBjb3VsZCBub3QgZGVsZXRlXCI6IFwi6ZSZ6K+v77yM5peg5rOV5Yig6ZmkXCIsXHJcbiAgXCJJbWFnZSBzaXplIHN1ZmZpeFwiOiBcIuWbvueJh+Wkp+Wwj+WQjue8gFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXggRGVzY3JpcHRpb25cIjogXCLmr5TlpoLvvJp8MzAwIOeUqOS6juiwg+aVtOWbvueJh+Wkp+Wwj1wiLFxyXG4gIFwiUGxlYXNlIGlucHV0IGltYWdlIHNpemUgc3VmZml4XCI6IFwi6K+36L6T5YWl5Zu+54mH5aSn5bCP5ZCO57yAXCIsXHJcbiAgXCJQbGVhc2UgaW5wdXQgUGljR28tQ29yZSBwYXRoLCBkZWZhdWx0IHVzaW5nIGVudmlyb25tZW50IHZhcmlhYmxlc1wiOlxyXG4gICAgXCLor7fovpPlhaUgUGljR28tQ29yZSBwYXRo77yM6buY6K6k5L2/55So546v5aKD5Y+Y6YePXCIsXHJcbiAgXCJXb3JrIG9uIG5ldHdvcmtcIjogXCLlupTnlKjnvZHnu5zlm77niYdcIixcclxuICBcIldvcmsgb24gbmV0d29yayBEZXNjcmlwdGlvblwiOlxyXG4gICAgXCLlvZPkvaDkuIrkvKDmiYDmnInlm77niYfml7bvvIzkuZ/kvJrkuIrkvKDnvZHnu5zlm77niYfjgILku6Xlj4rlvZPkvaDov5vooYzpu4/otLTml7bvvIzliarliIfmnb/kuK3nmoTmoIflh4YgbWQg5Zu+54mH5Lya6KKr5LiK5LygXCIsXHJcbiAgXCJVcGxvYWQgd2hlbiBjbGlwYm9hcmQgaGFzIGltYWdlIGFuZCB0ZXh0IHRvZ2V0aGVyXCI6XHJcbiAgICBcIuW9k+WJquWIh+adv+WQjOaXtuaLpeacieaWh+acrOWSjOWbvueJh+WJquWIh+adv+aVsOaNruaXtuaYr+WQpuS4iuS8oOWbvueJh1wiLFxyXG4gIFwiV2hlbiB5b3UgY29weSwgc29tZSBhcHBsaWNhdGlvbiBsaWtlIEV4Y2VsIHdpbGwgaW1hZ2UgYW5kIHRleHQgdG8gY2xpcGJvYXJkLCB5b3UgY2FuIHVwbG9hZCBvciBub3QuXCI6XHJcbiAgICBcIuW9k+S9oOWkjeWItuaXtu+8jOafkOS6m+W6lOeUqOS+i+WmgiBFeGNlbCDkvJrlnKjliarliIfmnb/lkIzml7bmlofmnKzlkozlm77lg4/mlbDmja7vvIznoa7orqTmmK/lkKbkuIrkvKDjgIJcIixcclxuICBcIk5ldHdvcmsgRG9tYWluIEJsYWNrIExpc3RcIjogXCLnvZHnu5zlm77niYfln5/lkI3pu5HlkI3ljZVcIixcclxuICBcIk5ldHdvcmsgRG9tYWluIEJsYWNrIExpc3QgRGVzY3JpcHRpb25cIjpcclxuICAgIFwi6buR5ZCN5Y2V5Z+f5ZCN5Lit55qE5Zu+54mH5bCG5LiN5Lya6KKr5LiK5Lyg77yM55So6Iux5paH6YCX5Y+35YiG5YmyXCIsXHJcbiAgXCJEZWxldGUgc291cmNlIGZpbGUgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlXCI6IFwi5LiK5Lyg5paH5Lu25ZCO56e76Zmk5rqQ5paH5Lu2XCIsXHJcbiAgXCJEZWxldGUgc291cmNlIGZpbGUgaW4gb2IgYXNzZXRzIGFmdGVyIHlvdSB1cGxvYWQgZmlsZS5cIjpcclxuICAgIFwi5LiK5Lyg5paH5Lu25ZCO56e76Zmk5Zyob2LpmYTku7bmlofku7blpLnkuK3nmoTmlofku7ZcIixcclxuICBcIkltYWdlIGRlc2NcIjogXCLlm77niYfmj4/ov7BcIixcclxuICByZXNlcnZlOiBcIum7mOiupFwiLFxyXG4gIFwicmVtb3ZlIGFsbFwiOiBcIuaXoFwiLFxyXG4gIFwicmVtb3ZlIGRlZmF1bHRcIjogXCLnp7vpmaRpbWFnZS5wbmdcIixcclxuICBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiOiBcIui/nOeoi+acjeWKoeWZqOaooeW8j1wiLFxyXG4gIFwiUmVtb3RlIHNlcnZlciBtb2RlIGRlc2NcIjogXCLlpoLmnpzkvaDlnKjmnI3liqHlmajpg6jnvbLkuoZwaWNsaXN0LWNvcmXmiJbogIVwaWNsaXN0XCIsXHJcbiAgXCJDYW4gbm90IGZpbmQgaW1hZ2UgZmlsZVwiOiBcIuayoeacieino+aekOWIsOWbvuWDj+aWh+S7tlwiLFxyXG4gIFwiRmlsZSBoYXMgYmVlbiBjaGFuZ2VkZCwgdXBsb2FkIGZhaWx1cmVcIjogXCLlvZPliY3mlofku7blt7Llj5jmm7TvvIzkuIrkvKDlpLHotKVcIixcclxuICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIGRvd25sb2FkIGZhaWx1cmVcIjogXCLlvZPliY3mlofku7blt7Llj5jmm7TvvIzkuIvovb3lpLHotKVcIixcclxuICBcIldhcm5pbmc6IHVwbG9hZCBmaWxlcyBpcyBkaWZmZXJlbnQgb2YgcmVjaXZlciBmaWxlcyBmcm9tIGFwaVwiOlxyXG4gICAgXCLorablkYrvvJrkuIrkvKDnmoTmlofku7bkuI7mjqXlj6Pov5Tlm57nmoTmlofku7bmlbDph4/kuI3kuIDoh7RcIixcclxuICB1cGxvYWQ6IFwi5LiK5LygXCIsXHJcbn07XHJcbiIsIi8vIOe5gemrlOS4reaWh1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsImltcG9ydCB7IG1vbWVudCB9IGZyb20gJ29ic2lkaWFuJztcclxuXHJcbmltcG9ydCBhciBmcm9tICcuL2xvY2FsZS9hcic7XHJcbmltcG9ydCBjeiBmcm9tICcuL2xvY2FsZS9jeic7XHJcbmltcG9ydCBkYSBmcm9tICcuL2xvY2FsZS9kYSc7XHJcbmltcG9ydCBkZSBmcm9tICcuL2xvY2FsZS9kZSc7XHJcbmltcG9ydCBlbiBmcm9tICcuL2xvY2FsZS9lbic7XHJcbmltcG9ydCBlbkdCIGZyb20gJy4vbG9jYWxlL2VuLWdiJztcclxuaW1wb3J0IGVzIGZyb20gJy4vbG9jYWxlL2VzJztcclxuaW1wb3J0IGZyIGZyb20gJy4vbG9jYWxlL2ZyJztcclxuaW1wb3J0IGhpIGZyb20gJy4vbG9jYWxlL2hpJztcclxuaW1wb3J0IGlkIGZyb20gJy4vbG9jYWxlL2lkJztcclxuaW1wb3J0IGl0IGZyb20gJy4vbG9jYWxlL2l0JztcclxuaW1wb3J0IGphIGZyb20gJy4vbG9jYWxlL2phJztcclxuaW1wb3J0IGtvIGZyb20gJy4vbG9jYWxlL2tvJztcclxuaW1wb3J0IG5sIGZyb20gJy4vbG9jYWxlL25sJztcclxuaW1wb3J0IG5vIGZyb20gJy4vbG9jYWxlL25vJztcclxuaW1wb3J0IHBsIGZyb20gJy4vbG9jYWxlL3BsJztcclxuaW1wb3J0IHB0IGZyb20gJy4vbG9jYWxlL3B0JztcclxuaW1wb3J0IHB0QlIgZnJvbSAnLi9sb2NhbGUvcHQtYnInO1xyXG5pbXBvcnQgcm8gZnJvbSAnLi9sb2NhbGUvcm8nO1xyXG5pbXBvcnQgcnUgZnJvbSAnLi9sb2NhbGUvcnUnO1xyXG5pbXBvcnQgdHIgZnJvbSAnLi9sb2NhbGUvdHInO1xyXG5pbXBvcnQgemhDTiBmcm9tICcuL2xvY2FsZS96aC1jbic7XHJcbmltcG9ydCB6aFRXIGZyb20gJy4vbG9jYWxlL3poLXR3JztcclxuXHJcbmNvbnN0IGxvY2FsZU1hcDogeyBbazogc3RyaW5nXTogUGFydGlhbDx0eXBlb2YgZW4+IH0gPSB7XHJcbiAgYXIsXHJcbiAgY3M6IGN6LFxyXG4gIGRhLFxyXG4gIGRlLFxyXG4gIGVuLFxyXG4gICdlbi1nYic6IGVuR0IsXHJcbiAgZXMsXHJcbiAgZnIsXHJcbiAgaGksXHJcbiAgaWQsXHJcbiAgaXQsXHJcbiAgamEsXHJcbiAga28sXHJcbiAgbmwsXHJcbiAgbm46IG5vLFxyXG4gIHBsLFxyXG4gIHB0LFxyXG4gICdwdC1icic6IHB0QlIsXHJcbiAgcm8sXHJcbiAgcnUsXHJcbiAgdHIsXHJcbiAgJ3poLWNuJzogemhDTixcclxuICAnemgtdHcnOiB6aFRXLFxyXG59O1xyXG5cclxuY29uc3QgbG9jYWxlID0gbG9jYWxlTWFwW21vbWVudC5sb2NhbGUoKV07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdChzdHI6IGtleW9mIHR5cGVvZiBlbik6IHN0cmluZyB7XHJcbiAgcmV0dXJuIChsb2NhbGUgJiYgbG9jYWxlW3N0cl0pIHx8IGVuW3N0cl07XHJcbn1cclxuIiwiaW1wb3J0IHsgbm9ybWFsaXplUGF0aCwgTm90aWNlLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyByZWxhdGl2ZSwgam9pbiwgcGFyc2UgfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcbmltcG9ydCBpbWFnZVR5cGUgZnJvbSBcImltYWdlLXR5cGVcIjtcclxuXHJcbmltcG9ydCB7IGdldFVybEFzc2V0LCB1dWlkIH0gZnJvbSBcIi4vdXRpbHNcIjtcclxuaW1wb3J0IHsgdCB9IGZyb20gXCIuL2xhbmcvaGVscGVyc1wiO1xyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkQWxsSW1hZ2VGaWxlcyhwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbikge1xyXG4gIGNvbnN0IGFjdGl2ZUZpbGUgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgY29uc3QgZm9sZGVyUGF0aCA9IGF3YWl0IHBsdWdpbi5hcHAuZmlsZU1hbmFnZXIuZ2V0QXZhaWxhYmxlUGF0aEZvckF0dGFjaG1lbnQoXHJcbiAgICBcIlwiXHJcbiAgKTtcclxuXHJcbiAgY29uc3QgZmlsZUFycmF5ID0gcGx1Z2luLmhlbHBlci5nZXRBbGxGaWxlcygpO1xyXG5cclxuICBpZiAoIShhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGZvbGRlclBhdGgpKSkge1xyXG4gICAgYXdhaXQgcGx1Z2luLmFwcC52YXVsdC5hZGFwdGVyLm1rZGlyKGZvbGRlclBhdGgpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGltYWdlQXJyYXkgPSBbXTtcclxuICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZUFycmF5KSB7XHJcbiAgICBpZiAoIWZpbGUucGF0aC5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB1cmwgPSBmaWxlLnBhdGg7XHJcbiAgICBjb25zdCBhc3NldCA9IGdldFVybEFzc2V0KHVybCk7XHJcbiAgICBsZXQgbmFtZSA9IGRlY29kZVVSSShwYXJzZShhc3NldCkubmFtZSkucmVwbGFjZUFsbCgvW1xcXFxcXFxcLzoqP1xcXCI8PnxdL2csIFwiLVwiKTtcclxuXHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvd25sb2FkKHBsdWdpbiwgdXJsLCBmb2xkZXJQYXRoLCBuYW1lKTtcclxuICAgIGlmIChyZXNwb25zZS5vaykge1xyXG4gICAgICBjb25zdCBhY3RpdmVGb2xkZXIgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCkucGFyZW50LnBhdGg7XHJcblxyXG4gICAgICBpbWFnZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHNvdXJjZTogZmlsZS5zb3VyY2UsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBwYXRoOiBub3JtYWxpemVQYXRoKFxyXG4gICAgICAgICAgcmVsYXRpdmUobm9ybWFsaXplUGF0aChhY3RpdmVGb2xkZXIpLCBub3JtYWxpemVQYXRoKHJlc3BvbnNlLnBhdGgpKVxyXG4gICAgICAgICksXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IHZhbHVlID0gcGx1Z2luLmhlbHBlci5nZXRWYWx1ZSgpO1xyXG4gIGltYWdlQXJyYXkubWFwKGltYWdlID0+IHtcclxuICAgIGxldCBuYW1lID0gcGx1Z2luLmhhbmRsZU5hbWUoaW1hZ2UubmFtZSk7XHJcblxyXG4gICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKGltYWdlLnNvdXJjZSwgYCFbJHtuYW1lfV0oJHtlbmNvZGVVUkkoaW1hZ2UucGF0aCl9KWApO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBjdXJyZW50RmlsZSA9IHBsdWdpbi5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICBpZiAoYWN0aXZlRmlsZS5wYXRoICE9PSBjdXJyZW50RmlsZS5wYXRoKSB7XHJcbiAgICBuZXcgTm90aWNlKHQoXCJGaWxlIGhhcyBiZWVuIGNoYW5nZWRkLCBkb3dubG9hZCBmYWlsdXJlXCIpKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgcGx1Z2luLmhlbHBlci5zZXRWYWx1ZSh2YWx1ZSk7XHJcblxyXG4gIG5ldyBOb3RpY2UoXHJcbiAgICBgYWxsOiAke2ZpbGVBcnJheS5sZW5ndGh9XFxuc3VjY2VzczogJHtpbWFnZUFycmF5Lmxlbmd0aH1cXG5mYWlsZWQ6ICR7XHJcbiAgICAgIGZpbGVBcnJheS5sZW5ndGggLSBpbWFnZUFycmF5Lmxlbmd0aFxyXG4gICAgfWBcclxuICApO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBkb3dubG9hZChcclxuICBwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbixcclxuICB1cmw6IHN0cmluZyxcclxuICBmb2xkZXJQYXRoOiBzdHJpbmcsXHJcbiAgbmFtZTogc3RyaW5nXHJcbikge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFVybCh7IHVybCB9KTtcclxuXHJcbiAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogZmFsc2UsXHJcbiAgICAgIG1zZzogXCJlcnJvclwiLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHR5cGUgPSBhd2FpdCBpbWFnZVR5cGUobmV3IFVpbnQ4QXJyYXkocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcclxuICBpZiAoIXR5cGUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgbXNnOiBcImVycm9yXCIsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGxldCBwYXRoID0gbm9ybWFsaXplUGF0aChqb2luKGZvbGRlclBhdGgsIGAke25hbWV9LiR7dHlwZS5leHR9YCkpO1xyXG5cclxuICAgIC8vIOWmguaenOaWh+S7tuWQjeW3suWtmOWcqO+8jOWImeeUqOmaj+acuuWAvOabv+aNou+8jOS4jeWvueaWh+S7tuWQjue8gOi/m+ihjOWIpOaWrVxyXG4gICAgaWYgKGF3YWl0IHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMocGF0aCkpIHtcclxuICAgICAgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoam9pbihmb2xkZXJQYXRoLCBgJHt1dWlkKCl9LiR7dHlwZS5leHR9YCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci53cml0ZUJpbmFyeShwYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogdHJ1ZSxcclxuICAgICAgbXNnOiBcIm9rXCIsXHJcbiAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgIHR5cGUsXHJcbiAgICB9O1xyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBtc2c6IGVycixcclxuICAgIH07XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGdldEJsb2JBcnJheUJ1ZmZlciB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxudHlwZSBQYXlsb2FkQW5kQm91bmRhcnkgPSBbQXJyYXlCdWZmZXIsIHN0cmluZ107XHJcblxyXG50eXBlIElucHV0VHlwZSA9IHN0cmluZyB8IEJsb2IgfCBBcnJheUJ1ZmZlciB8IEZpbGU7XHJcblxyXG5leHBvcnQgdHlwZSBQYXlsb2FkRGF0YSA9IHsgW2tleTogc3RyaW5nXTogSW5wdXRUeXBlIHwgSW5wdXRUeXBlW10gfTtcclxuXHJcbmV4cG9ydCBjb25zdCByYW5kb21TdHJpbmcgPSAobGVuZ3RoOiBudW1iZXIpID0+XHJcbiAgQXJyYXkobGVuZ3RoICsgMSlcclxuICAgIC5qb2luKChNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KSArIFwiMDAwMDAwMDAwMDAwMDAwMDBcIikuc2xpY2UoMiwgMTgpKVxyXG4gICAgLnNsaWNlKDAsIGxlbmd0aCk7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGF5bG9hZEdlbmVyYXRvcihcclxuICBwYXlsb2FkX2RhdGE6IFBheWxvYWREYXRhXHJcbik6IFByb21pc2U8UGF5bG9hZEFuZEJvdW5kYXJ5PiB7XHJcbiAgY29uc3QgYm91bmRhcnlfc3RyaW5nID0gYEJvdW5kYXJ5JHtyYW5kb21TdHJpbmcoMTYpfWA7XHJcbiAgY29uc3QgYm91bmRhcnkgPSBgLS0tLS0tJHtib3VuZGFyeV9zdHJpbmd9YDtcclxuICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xyXG5cclxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlc10gb2YgT2JqZWN0LmVudHJpZXMocGF5bG9hZF9kYXRhKSkge1xyXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiBBcnJheS5pc0FycmF5KHZhbHVlcykgPyB2YWx1ZXMgOiBbdmFsdWVzXSkge1xyXG4gICAgICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7Ym91bmRhcnl9XFxyXFxuYCkpO1xyXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIlxcclxcblxcclxcbiR7dmFsdWV9XFxyXFxuYFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBGaWxlKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIjsgZmlsZW5hbWU9XCIke1xyXG4gICAgICAgICAgICAgIHZhbHVlLm5hbWVcclxuICAgICAgICAgICAgfVwiXFxyXFxuQ29udGVudC1UeXBlOiAke1xyXG4gICAgICAgICAgICAgIHZhbHVlLnR5cGUgfHwgXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIlxyXG4gICAgICAgICAgICB9XFxyXFxuXFxyXFxuYFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2gobmV3IFVpbnQ4QXJyYXkoYXdhaXQgZ2V0QmxvYkFycmF5QnVmZmVyKHZhbHVlKSkpO1xyXG4gICAgICAgIGNodW5rcy5wdXNoKG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcIlxcclxcblwiKSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBCbG9iKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIjsgZmlsZW5hbWU9XCJibG9iXCJcXHJcXG5Db250ZW50LVR5cGU6ICR7XHJcbiAgICAgICAgICAgICAgdmFsdWUudHlwZSB8fCBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiXHJcbiAgICAgICAgICAgIH1cXHJcXG5cXHJcXG5gXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgKTtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVWludDhBcnJheShhd2FpdCB2YWx1ZS5hcnJheUJ1ZmZlcigpKSk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2gobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFwiXFxyXFxuXCIpKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVWludDhBcnJheShhd2FpdCBuZXcgUmVzcG9uc2UodmFsdWUpLmFycmF5QnVmZmVyKCkpKTtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXCJcXHJcXG5cIikpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7Ym91bmRhcnl9LS1cXHJcXG5gKSk7XHJcblxyXG4gIGNvbnN0IHBheWxvYWQgPSBuZXcgQmxvYihjaHVua3MsIHtcclxuICAgIHR5cGU6IFwibXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9XCIgKyBib3VuZGFyeV9zdHJpbmcsXHJcbiAgfSk7XHJcbiAgcmV0dXJuIFthd2FpdCBwYXlsb2FkLmFycmF5QnVmZmVyKCksIGJvdW5kYXJ5X3N0cmluZ107XHJcbn1cclxuIiwiaW1wb3J0IHsgam9pbiwgZXh0bmFtZSB9IGZyb20gXCJwYXRoLWJyb3dzZXJpZnlcIjtcclxuaW1wb3J0IHsgcmVxdWVzdFVybCwgbm9ybWFsaXplUGF0aCwgRmlsZVN5c3RlbUFkYXB0ZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IGJ1ZmZlclRvQXJyYXlCdWZmZXIgfSBmcm9tIFwiLi4vdXRpbHNcIjtcclxuaW1wb3J0IHsgcGF5bG9hZEdlbmVyYXRvciB9IGZyb20gXCIuLi9wYXlsb2FkR2VuZXJhdG9yXCI7XHJcblxyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcclxuaW1wb3J0IHR5cGUgeyBJbWFnZSB9IGZyb20gXCIuLi90eXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IFJlc3BvbnNlLCBVcGxvYWRlciB9IGZyb20gXCIuL3R5cGVzXCI7XHJcbmltcG9ydCB0eXBlIHsgUGx1Z2luU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2V0dGluZ1wiO1xyXG5cclxuaW50ZXJmYWNlIFBpY0dvUmVzcG9uc2Uge1xyXG4gIHN1Y2Nlc3M/OiBib29sZWFuO1xyXG4gIG1lc3NhZ2U/OiBzdHJpbmc7XHJcbiAgbXNnPzogc3RyaW5nO1xyXG4gIHJlc3VsdDogc3RyaW5nW10gfCBzdHJpbmc7XHJcbiAgZnVsbFJlc3VsdD86IFJlY29yZDxzdHJpbmcsIGFueT5bXTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUGljR29VcGxvYWRlciBpbXBsZW1lbnRzIFVwbG9hZGVyIHtcclxuICBzZXR0aW5nczogUGx1Z2luU2V0dGluZ3M7XHJcbiAgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogaW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEZpbGVzKGZpbGVMaXN0OiBBcnJheTxJbWFnZSB8IHN0cmluZz4pIHtcclxuICAgIGxldCByZXNwb25zZTogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj47XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBjb25zdCBmaWxlcyA9IFtdO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBmaWxlTGlzdFtpXSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgY29uc3QgeyByZWFkRmlsZSB9ID0gcmVxdWlyZShcImZzXCIpO1xyXG4gICAgICAgICAgY29uc3QgZmlsZSA9IGZpbGVMaXN0W2ldIGFzIHN0cmluZztcclxuXHJcbiAgICAgICAgICBjb25zdCBidWZmZXI6IEJ1ZmZlciA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgcmVhZEZpbGUoZmlsZSwgKGVycjogYW55LCBkYXRhOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYnVmZmVyVG9BcnJheUJ1ZmZlcihidWZmZXIpO1xyXG4gICAgICAgICAgZmlsZXMucHVzaChuZXcgRmlsZShbYXJyYXlCdWZmZXJdLCBmaWxlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICAgICAgY29uc3QgaW1hZ2UgPSBmaWxlTGlzdFtpXSBhcyBJbWFnZTtcclxuXHJcbiAgICAgICAgICBpZiAoIWltYWdlLmZpbGUpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci5yZWFkQmluYXJ5KFxyXG4gICAgICAgICAgICBpbWFnZS5maWxlLnBhdGhcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgZmlsZXMucHVzaChcclxuICAgICAgICAgICAgbmV3IEZpbGUoW2FycmF5QnVmZmVyXSwgdGltZXN0YW1wICsgZXh0bmFtZShpbWFnZS5maWxlLnBhdGgpKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnVwbG9hZEZpbGVCeURhdGEoZmlsZXMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgYmFzZVBhdGggPSAoXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIgYXMgRmlsZVN5c3RlbUFkYXB0ZXJcclxuICAgICAgKS5nZXRCYXNlUGF0aCgpO1xyXG5cclxuICAgICAgY29uc3QgbGlzdCA9IGZpbGVMaXN0Lm1hcChpdGVtID0+IHtcclxuICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChqb2luKGJhc2VQYXRoLCBpdGVtLnBhdGgpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcclxuICAgICAgICB1cmw6IHRoaXMuc2V0dGluZ3MudXBsb2FkU2VydmVyLFxyXG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbGlzdDogbGlzdCB9KSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzcG9uc2UocmVzcG9uc2UpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRGaWxlQnlEYXRhKGZpbGVMaXN0OiBGaWxlTGlzdCB8IEZpbGVbXSkge1xyXG4gICAgY29uc3QgcGF5bG9hZF9kYXRhOiB7XHJcbiAgICAgIFtrZXk6IHN0cmluZ106IChzdHJpbmcgfCBCbG9iIHwgQXJyYXlCdWZmZXIgfCBGaWxlKVtdO1xyXG4gICAgfSA9IHtcclxuICAgICAgbGlzdDogW10sXHJcbiAgICB9O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUxpc3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgY29uc3QgZmlsZSA9IGZpbGVMaXN0W2ldO1xyXG4gICAgICBwYXlsb2FkX2RhdGFbXCJsaXN0XCJdLnB1c2goZmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgW3JlcXVlc3RfYm9keSwgYm91bmRhcnlfc3RyaW5nXSA9IGF3YWl0IHBheWxvYWRHZW5lcmF0b3IoXHJcbiAgICAgIHBheWxvYWRfZGF0YVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBvcHRpb25zID0ge1xyXG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICB1cmw6IHRoaXMuc2V0dGluZ3MudXBsb2FkU2VydmVyLFxyXG4gICAgICBjb250ZW50VHlwZTogYG11bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PS0tLS0ke2JvdW5kYXJ5X3N0cmluZ31gLFxyXG4gICAgICBib2R5OiByZXF1ZXN0X2JvZHksXHJcbiAgICB9O1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKG9wdGlvbnMpO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkRmlsZUJ5Q2xpcGJvYXJkKGZpbGVMaXN0PzogRmlsZUxpc3QpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgbGV0IHJlczogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj47XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBjb25zdCBmaWxlcyA9IFtdO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGUgPSBmaWxlTGlzdFtpXTtcclxuICAgICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICBmaWxlcy5wdXNoKG5ldyBGaWxlKFthcnJheUJ1ZmZlcl0sIHRpbWVzdGFtcCArIFwiLnBuZ1wiKSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRGaWxlQnlEYXRhKGZpbGVzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdGhpcy5zZXR0aW5ncy51cGxvYWRTZXJ2ZXIsXHJcbiAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNwb25zZShyZXMpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog5aSE55CG6L+U5Zue5YC8XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVSZXNwb25zZShcclxuICAgIHJlc3BvbnNlOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIHJlcXVlc3RVcmw+PlxyXG4gICk6IFByb21pc2U8UmVzcG9uc2U+IHtcclxuICAgIGNvbnN0IGRhdGEgPSAoYXdhaXQgcmVzcG9uc2UuanNvbikgYXMgUGljR29SZXNwb25zZTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgY29uc29sZS5lcnJvcihyZXNwb25zZSwgZGF0YSk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgbXNnOiBkYXRhLm1zZyB8fCBkYXRhLm1lc3NhZ2UsXHJcbiAgICAgICAgcmVzdWx0OiBbXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIGlmIChkYXRhLnN1Y2Nlc3MgPT09IGZhbHNlKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IocmVzcG9uc2UsIGRhdGEpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgIG1zZzogZGF0YS5tc2cgfHwgZGF0YS5tZXNzYWdlLFxyXG4gICAgICAgIHJlc3VsdDogW10sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gcGljbGlzdFxyXG4gICAgaWYgKGRhdGEuZnVsbFJlc3VsdCkge1xyXG4gICAgICBjb25zdCB1cGxvYWRVcmxGdWxsUmVzdWx0TGlzdCA9IGRhdGEuZnVsbFJlc3VsdCB8fCBbXTtcclxuICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcyA9IFtcclxuICAgICAgICAuLi4odGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcyB8fCBbXSksXHJcbiAgICAgICAgLi4udXBsb2FkVXJsRnVsbFJlc3VsdExpc3QsXHJcbiAgICAgIF07XHJcbiAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgIG1zZzogXCJzdWNjZXNzXCIsXHJcbiAgICAgIHJlc3VsdDogdHlwZW9mIGRhdGEucmVzdWx0ID09IFwic3RyaW5nXCIgPyBbZGF0YS5yZXN1bHRdIDogZGF0YS5yZXN1bHQsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgdXBsb2FkKGZpbGVMaXN0OiBBcnJheTxJbWFnZT4gfCBBcnJheTxzdHJpbmc+KSB7XHJcbiAgICByZXR1cm4gdGhpcy51cGxvYWRGaWxlcyhmaWxlTGlzdCk7XHJcbiAgfVxyXG4gIGFzeW5jIHVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0PzogRmlsZUxpc3QpIHtcclxuICAgIHJldHVybiB0aGlzLnVwbG9hZEZpbGVCeUNsaXBib2FyZChmaWxlTGlzdCk7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcblxyXG5pbXBvcnQgeyBzdHJlYW1Ub1N0cmluZywgZ2V0TGFzdEltYWdlIH0gZnJvbSBcIi4uL3V0aWxzXCI7XHJcbmltcG9ydCB7IG5vcm1hbGl6ZVBhdGgsIEZpbGVTeXN0ZW1BZGFwdGVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcclxuaW1wb3J0IHR5cGUgeyBJbWFnZSB9IGZyb20gXCIuLi90eXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IFBsdWdpblNldHRpbmdzIH0gZnJvbSBcIi4uL3NldHRpbmdcIjtcclxuaW1wb3J0IHR5cGUgeyBVcGxvYWRlciB9IGZyb20gXCIuL3R5cGVzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQaWNHb0NvcmVVcGxvYWRlciBpbXBsZW1lbnRzIFVwbG9hZGVyIHtcclxuICBzZXR0aW5nczogUGx1Z2luU2V0dGluZ3M7XHJcbiAgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogaW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEZpbGVzKGZpbGVMaXN0OiBBcnJheTxJbWFnZT4gfCBBcnJheTxzdHJpbmc+KSB7XHJcbiAgICBjb25zdCBiYXNlUGF0aCA9IChcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIgYXMgRmlsZVN5c3RlbUFkYXB0ZXJcclxuICAgICkuZ2V0QmFzZVBhdGgoKTtcclxuXHJcbiAgICBjb25zdCBsaXN0ID0gZmlsZUxpc3QubWFwKGl0ZW0gPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICByZXR1cm4gaXRlbTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChqb2luKGJhc2VQYXRoLCBpdGVtLnBhdGgpKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XHJcbiAgICBsZXQgY2xpID0gdGhpcy5zZXR0aW5ncy5waWNnb0NvcmVQYXRoIHx8IFwicGljZ29cIjtcclxuICAgIGxldCBjb21tYW5kID0gYCR7Y2xpfSB1cGxvYWQgJHtsaXN0Lm1hcChpdGVtID0+IGBcIiR7aXRlbX1cImApLmpvaW4oXCIgXCIpfWA7XHJcblxyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQpO1xyXG4gICAgY29uc3Qgc3BsaXRMaXN0ID0gcmVzLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgY29uc3Qgc3BsaXRMaXN0TGVuZ3RoID0gc3BsaXRMaXN0Lmxlbmd0aDtcclxuXHJcbiAgICBjb25zdCBkYXRhID0gc3BsaXRMaXN0LnNwbGljZShzcGxpdExpc3RMZW5ndGggLSAxIC0gbGVuZ3RoLCBsZW5ndGgpO1xyXG5cclxuICAgIGlmIChyZXMuaW5jbHVkZXMoXCJQaWNHbyBFUlJPUlwiKSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhjb21tYW5kLCByZXMpO1xyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICBtc2c6IFwi5aSx6LSlXCIsXHJcbiAgICAgICAgcmVzdWx0OiBbXSBhcyBzdHJpbmdbXSxcclxuICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICByZXN1bHQ6IGRhdGEsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBQaWNHby1Db3JlIOS4iuS8oOWkhOeQhlxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkRmlsZUJ5Q2xpcGJvYXJkKCkge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRCeUNsaXAoKTtcclxuICAgIGNvbnN0IHNwbGl0TGlzdCA9IHJlcy5zcGxpdChcIlxcblwiKTtcclxuICAgIGNvbnN0IGxhc3RJbWFnZSA9IGdldExhc3RJbWFnZShzcGxpdExpc3QpO1xyXG5cclxuICAgIGlmIChsYXN0SW1hZ2UpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgIG1zZzogXCJzdWNjZXNzXCIsXHJcbiAgICAgICAgcmVzdWx0OiBbbGFzdEltYWdlXSxcclxuICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKHNwbGl0TGlzdCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgIG1zZzogYFwiUGxlYXNlIGNoZWNrIFBpY0dvLUNvcmUgY29uZmlnXCJcXG4ke3Jlc31gLFxyXG4gICAgICAgIHJlc3VsdDogW10sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBQaWNHby1Db3Jl55qE5Ymq5YiH5LiK5Lyg5Y+N6aaIXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCeUNsaXAoKSB7XHJcbiAgICBsZXQgY29tbWFuZDtcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLnBpY2dvQ29yZVBhdGgpIHtcclxuICAgICAgY29tbWFuZCA9IGAke3RoaXMuc2V0dGluZ3MucGljZ29Db3JlUGF0aH0gdXBsb2FkYDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbW1hbmQgPSBgcGljZ28gdXBsb2FkYDtcclxuICAgIH1cclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kKTtcclxuXHJcbiAgICByZXR1cm4gcmVzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBleGVjKGNvbW1hbmQ6IHN0cmluZykge1xyXG4gICAgY29uc3QgeyBleGVjIH0gPSByZXF1aXJlKFwiY2hpbGRfcHJvY2Vzc1wiKTtcclxuICAgIGxldCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlYyhjb21tYW5kKTtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHN0cmVhbVRvU3RyaW5nKHN0ZG91dCk7XHJcbiAgICByZXR1cm4gcmVzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBzcGF3bkNoaWxkKCkge1xyXG4gICAgY29uc3QgeyBzcGF3biB9ID0gcmVxdWlyZShcImNoaWxkX3Byb2Nlc3NcIik7XHJcbiAgICBjb25zdCBjaGlsZCA9IHNwYXduKFwicGljZ29cIiwgW1widXBsb2FkXCJdLCB7XHJcbiAgICAgIHNoZWxsOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbGV0IGRhdGEgPSBcIlwiO1xyXG4gICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBjaGlsZC5zdGRvdXQpIHtcclxuICAgICAgZGF0YSArPSBjaHVuaztcclxuICAgIH1cclxuICAgIGxldCBlcnJvciA9IFwiXCI7XHJcbiAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIGNoaWxkLnN0ZGVycikge1xyXG4gICAgICBlcnJvciArPSBjaHVuaztcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXRDb2RlID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBjaGlsZC5vbihcImNsb3NlXCIsIHJlc29sdmUpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKGV4aXRDb2RlKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc3VicHJvY2VzcyBlcnJvciBleGl0ICR7ZXhpdENvZGV9LCAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRhdGE7XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGxvYWQoZmlsZUxpc3Q6IEFycmF5PEltYWdlPiB8IEFycmF5PHN0cmluZz4pIHtcclxuICAgIHJldHVybiB0aGlzLnVwbG9hZEZpbGVzKGZpbGVMaXN0KTtcclxuICB9XHJcbiAgYXN5bmMgdXBsb2FkQnlDbGlwYm9hcmQoZmlsZUxpc3Q/OiBGaWxlTGlzdCkge1xyXG4gICAgY29uc29sZS5sb2coXCJ1cGxvYWRCeUNsaXBib2FyZFwiLCBmaWxlTGlzdCk7XHJcbiAgICByZXR1cm4gdGhpcy51cGxvYWRGaWxlQnlDbGlwYm9hcmQoKTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgUGxhdGZvcm0sIE5vdGljZSB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuaW1wb3J0IFBpY0dvVXBsb2FkZXIgZnJvbSBcIi4vcGljZ29cIjtcclxuaW1wb3J0IFBpY0dvQ29yZVVwbG9hZGVyIGZyb20gXCIuL3BpY2dvQ29yZVwiO1xyXG5cclxuaW1wb3J0IHR5cGUgSW1hZ2VBdXRvVXBsb2FkUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XHJcbmltcG9ydCB0eXBlIHsgSW1hZ2UgfSBmcm9tIFwiLi4vdHlwZXNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRVcGxvYWRlcih1cGxvYWRlcjogc3RyaW5nKSB7XHJcbiAgc3dpdGNoICh1cGxvYWRlcikge1xyXG4gICAgY2FzZSBcIlBpY0dvXCI6XHJcbiAgICAgIHJldHVybiBQaWNHb1VwbG9hZGVyO1xyXG4gICAgY2FzZSBcIlBpY0dvLUNvcmVcIjpcclxuICAgICAgcmV0dXJuIFBpY0dvQ29yZVVwbG9hZGVyO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB1cGxvYWRlclwiKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBVcGxvYWRlck1hbmFnZXIge1xyXG4gIHVwbG9hZGVyOiBQaWNHb1VwbG9hZGVyIHwgUGljR29Db3JlVXBsb2FkZXI7XHJcbiAgcGx1Z2luOiBJbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHVwbG9hZGVyOiBzdHJpbmcsIHBsdWdpbjogSW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIGNvbnN0IFVwbG9hZGVyID0gZ2V0VXBsb2FkZXIodXBsb2FkZXIpO1xyXG4gICAgdGhpcy51cGxvYWRlciA9IG5ldyBVcGxvYWRlcih0aGlzLnBsdWdpbik7XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGxvYWQoZmlsZUxpc3Q6IEFycmF5PHN0cmluZz4gfCBBcnJheTxJbWFnZT4pIHtcclxuICAgIGlmIChQbGF0Zm9ybS5pc01vYmlsZUFwcCAmJiAhdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiTW9iaWxlIEFwcCBtdXN0IHVzZSByZW1vdGUgc2VydmVyIG1vZGUuXCIpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNb2JpbGUgQXBwIG11c3QgdXNlIHJlbW90ZSBzZXJ2ZXIgbW9kZS5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRlci51cGxvYWQoZmlsZUxpc3QpO1xyXG4gICAgaWYgKCFyZXMuc3VjY2Vzcykge1xyXG4gICAgICBuZXcgTm90aWNlKHJlcy5tc2cgfHwgXCJVcGxvYWQgRmFpbGVkXCIpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IocmVzLm1zZyB8fCBcIlVwbG9hZCBGYWlsZWRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcztcclxuICB9XHJcbiAgYXN5bmMgdXBsb2FkQnlDbGlwYm9hcmQoZmlsZUxpc3Q/OiBGaWxlTGlzdCkge1xyXG4gICAgaWYgKFBsYXRmb3JtLmlzTW9iaWxlQXBwICYmICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVTZXJ2ZXJNb2RlKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJNb2JpbGUgQXBwIG11c3QgdXNlIHJlbW90ZSBzZXJ2ZXIgbW9kZS5cIik7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk1vYmlsZSBBcHAgbXVzdCB1c2UgcmVtb3RlIHNlcnZlciBtb2RlLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnVwbG9hZGVyLnVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0KTtcclxuICAgIGlmICghcmVzLnN1Y2Nlc3MpIHtcclxuICAgICAgbmV3IE5vdGljZShyZXMubXNnIHx8IFwiVXBsb2FkIEZhaWxlZFwiKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKHJlcy5tc2cgfHwgXCJVcGxvYWQgRmFpbGVkXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXM7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBVcGxvYWRlciA9IFBpY0dvVXBsb2FkZXIgfCBQaWNHb0NvcmVVcGxvYWRlcjtcclxuZXhwb3J0IHsgUGljR29VcGxvYWRlciwgUGljR29Db3JlVXBsb2FkZXIgfTtcclxuIiwiaW1wb3J0IHsgSVN0cmluZ0tleU1hcCB9IGZyb20gXCIuL3V0aWxzXCI7XHJcbmltcG9ydCB7IHJlcXVlc3RVcmwgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IGltYWdlQXV0b1VwbG9hZFBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgUGljR29EZWxldGVyIHtcclxuICBwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IocGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW4pIHtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZGVsZXRlSW1hZ2UoY29uZmlnTWFwOiBJU3RyaW5nS2V5TWFwPGFueT5bXSkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcclxuICAgICAgdXJsOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWxldGVTZXJ2ZXIsXHJcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGxpc3Q6IGNvbmZpZ01hcCxcclxuICAgICAgfSksXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5qc29uO1xyXG4gICAgcmV0dXJuIGRhdGE7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IE1hcmtkb3duVmlldywgQXBwIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSBcInBhdGgtYnJvd3NlcmlmeVwiO1xyXG5cclxuaW50ZXJmYWNlIEltYWdlIHtcclxuICBwYXRoOiBzdHJpbmc7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHNvdXJjZTogc3RyaW5nO1xyXG59XHJcbi8vICFbXSguL2RzYS9hYS5wbmcpIGxvY2FsIGltYWdlIHNob3VsZCBoYXMgZXh0LCBzdXBwb3J0ICFbXSg8Li9kc2EvYWEucG5nPiksIHN1cHBvcnQgIVtdKGltYWdlLnBuZyBcImFsdFwiKVxyXG4vLyAhW10oaHR0cHM6Ly9kYXNkYXNkYSkgaW50ZXJuZXQgaW1hZ2Ugc2hvdWxkIG5vdCBoYXMgZXh0XHJcbmNvbnN0IFJFR0VYX0ZJTEUgPVxyXG4gIC9cXCFcXFsoLio/KVxcXVxcKDwoXFxTK1xcLlxcdyspPlxcKXxcXCFcXFsoLio/KVxcXVxcKChcXFMrXFwuXFx3KykoPzpcXHMrXCJbXlwiXSpcIik/XFwpfFxcIVxcWyguKj8pXFxdXFwoKGh0dHBzPzpcXC9cXC8uKj8pXFwpL2c7XHJcbmNvbnN0IFJFR0VYX1dJS0lfRklMRSA9IC9cXCFcXFtcXFsoLio/KShcXHMqP1xcfC4qPyk/XFxdXFxdL2c7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBIZWxwZXIge1xyXG4gIGFwcDogQXBwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCkge1xyXG4gICAgdGhpcy5hcHAgPSBhcHA7XHJcbiAgfVxyXG5cclxuICBnZXRGcm9udG1hdHRlclZhbHVlKGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGFueSA9IHVuZGVmaW5lZCkge1xyXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICBpZiAoIWZpbGUpIHtcclxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIGNvbnN0IHBhdGggPSBmaWxlLnBhdGg7XHJcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Q2FjaGUocGF0aCk7XHJcblxyXG4gICAgbGV0IHZhbHVlID0gZGVmYXVsdFZhbHVlO1xyXG4gICAgaWYgKGNhY2hlPy5mcm9udG1hdHRlciAmJiBjYWNoZS5mcm9udG1hdHRlci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgIHZhbHVlID0gY2FjaGUuZnJvbnRtYXR0ZXJba2V5XTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWx1ZTtcclxuICB9XHJcblxyXG4gIGdldEVkaXRvcigpIHtcclxuICAgIGNvbnN0IG1kVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICBpZiAobWRWaWV3KSB7XHJcbiAgICAgIHJldHVybiBtZFZpZXcuZWRpdG9yO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBnZXRWYWx1ZSgpIHtcclxuICAgIGNvbnN0IGVkaXRvciA9IHRoaXMuZ2V0RWRpdG9yKCk7XHJcbiAgICByZXR1cm4gZWRpdG9yLmdldFZhbHVlKCk7XHJcbiAgfVxyXG5cclxuICBzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBlZGl0b3IgPSB0aGlzLmdldEVkaXRvcigpO1xyXG4gICAgY29uc3QgeyBsZWZ0LCB0b3AgfSA9IGVkaXRvci5nZXRTY3JvbGxJbmZvKCk7XHJcbiAgICBjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRDdXJzb3IoKTtcclxuXHJcbiAgICBlZGl0b3Iuc2V0VmFsdWUodmFsdWUpO1xyXG4gICAgZWRpdG9yLnNjcm9sbFRvKGxlZnQsIHRvcCk7XHJcbiAgICBlZGl0b3Iuc2V0Q3Vyc29yKHBvc2l0aW9uKTtcclxuICB9XHJcblxyXG4gIC8vIGdldCBhbGwgZmlsZSB1cmxzLCBpbmNsdWRlIGxvY2FsIGFuZCBpbnRlcm5ldFxyXG4gIGdldEFsbEZpbGVzKCk6IEltYWdlW10ge1xyXG4gICAgY29uc3QgZWRpdG9yID0gdGhpcy5nZXRFZGl0b3IoKTtcclxuICAgIGxldCB2YWx1ZSA9IGVkaXRvci5nZXRWYWx1ZSgpO1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0SW1hZ2VMaW5rKHZhbHVlKTtcclxuICB9XHJcblxyXG4gIGdldEltYWdlTGluayh2YWx1ZTogc3RyaW5nKTogSW1hZ2VbXSB7XHJcbiAgICBjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2hBbGwoUkVHRVhfRklMRSk7XHJcbiAgICBjb25zdCBXaWtpTWF0Y2hlcyA9IHZhbHVlLm1hdGNoQWxsKFJFR0VYX1dJS0lfRklMRSk7XHJcblxyXG4gICAgbGV0IGZpbGVBcnJheTogSW1hZ2VbXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICBjb25zdCBzb3VyY2UgPSBtYXRjaFswXTtcclxuXHJcbiAgICAgIGxldCBuYW1lID0gbWF0Y2hbMV07XHJcbiAgICAgIGxldCBwYXRoID0gbWF0Y2hbMl07XHJcbiAgICAgIGlmIChuYW1lID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBuYW1lID0gbWF0Y2hbM107XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHBhdGggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHBhdGggPSBtYXRjaFs0XTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZmlsZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBzb3VyY2U6IHNvdXJjZSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBXaWtpTWF0Y2hlcykge1xyXG4gICAgICBsZXQgbmFtZSA9IHBhcnNlKG1hdGNoWzFdKS5uYW1lO1xyXG4gICAgICBjb25zdCBwYXRoID0gbWF0Y2hbMV07XHJcbiAgICAgIGNvbnN0IHNvdXJjZSA9IG1hdGNoWzBdO1xyXG4gICAgICBpZiAobWF0Y2hbMl0pIHtcclxuICAgICAgICBuYW1lID0gYCR7bmFtZX0ke21hdGNoWzJdfWA7XHJcbiAgICAgIH1cclxuICAgICAgZmlsZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBzb3VyY2U6IHNvdXJjZSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZpbGVBcnJheTtcclxuICB9XHJcblxyXG4gIGhhc0JsYWNrRG9tYWluKHNyYzogc3RyaW5nLCBibGFja0RvbWFpbnM6IHN0cmluZykge1xyXG4gICAgaWYgKGJsYWNrRG9tYWlucy50cmltKCkgPT09IFwiXCIpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYmxhY2tEb21haW5MaXN0ID0gYmxhY2tEb21haW5zLnNwbGl0KFwiLFwiKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBcIlwiKTtcclxuICAgIGxldCB1cmwgPSBuZXcgVVJMKHNyYyk7XHJcbiAgICBjb25zdCBkb21haW4gPSB1cmwuaG9zdG5hbWU7XHJcblxyXG4gICAgcmV0dXJuIGJsYWNrRG9tYWluTGlzdC5zb21lKGJsYWNrRG9tYWluID0+IGRvbWFpbi5pbmNsdWRlcyhibGFja0RvbWFpbikpO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIE5vdGljZSwgUGxhdGZvcm0gfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IGltYWdlQXV0b1VwbG9hZFBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7IHQgfSBmcm9tIFwiLi9sYW5nL2hlbHBlcnNcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUGx1Z2luU2V0dGluZ3Mge1xyXG4gIHVwbG9hZEJ5Q2xpcFN3aXRjaDogYm9vbGVhbjtcclxuICB1cGxvYWRTZXJ2ZXI6IHN0cmluZztcclxuICBkZWxldGVTZXJ2ZXI6IHN0cmluZztcclxuICBpbWFnZVNpemVTdWZmaXg6IHN0cmluZztcclxuICB1cGxvYWRlcjogc3RyaW5nO1xyXG4gIHBpY2dvQ29yZVBhdGg6IHN0cmluZztcclxuICB3b3JrT25OZXRXb3JrOiBib29sZWFuO1xyXG4gIG5ld1dvcmtCbGFja0RvbWFpbnM6IHN0cmluZztcclxuICBhcHBseUltYWdlOiBib29sZWFuO1xyXG4gIGRlbGV0ZVNvdXJjZTogYm9vbGVhbjtcclxuICBpbWFnZURlc2M6IFwib3JpZ2luXCIgfCBcIm5vbmVcIiB8IFwicmVtb3ZlRGVmYXVsdFwiO1xyXG4gIHJlbW90ZVNlcnZlck1vZGU6IGJvb2xlYW47XHJcbiAgYWRkUGFuZG9jRmlnOiBib29sZWFuO1xyXG4gIFtwcm9wTmFtZTogc3RyaW5nXTogYW55O1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGx1Z2luU2V0dGluZ3MgPSB7XHJcbiAgdXBsb2FkQnlDbGlwU3dpdGNoOiB0cnVlLFxyXG4gIHVwbG9hZGVyOiBcIlBpY0dvXCIsXHJcbiAgdXBsb2FkU2VydmVyOiBcImh0dHA6Ly8xMjcuMC4wLjE6MzY2NzcvdXBsb2FkXCIsXHJcbiAgZGVsZXRlU2VydmVyOiBcImh0dHA6Ly8xMjcuMC4wLjE6MzY2NzcvZGVsZXRlXCIsXHJcbiAgaW1hZ2VTaXplU3VmZml4OiBcIlwiLFxyXG4gIHBpY2dvQ29yZVBhdGg6IFwiXCIsXHJcbiAgd29ya09uTmV0V29yazogZmFsc2UsXHJcbiAgYXBwbHlJbWFnZTogdHJ1ZSxcclxuICBuZXdXb3JrQmxhY2tEb21haW5zOiBcIlwiLFxyXG4gIGRlbGV0ZVNvdXJjZTogZmFsc2UsXHJcbiAgaW1hZ2VEZXNjOiBcIm9yaWdpblwiLFxyXG4gIHJlbW90ZVNlcnZlck1vZGU6IGZhbHNlLFxyXG4gIGFkZFBhbmRvY0ZpZzogZmFsc2UsXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogaW1hZ2VBdXRvVXBsb2FkUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGxldCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogdChcIlBsdWdpbiBTZXR0aW5nc1wiKSB9KTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiQXV0byBwYXN0ZWQgdXBsb2FkXCIpKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICB0KFxyXG4gICAgICAgICAgXCJJZiB5b3Ugc2V0IHRoaXMgdmFsdWUgdHJ1ZSwgd2hlbiB5b3UgcGFzdGUgaW1hZ2UsIGl0IHdpbGwgYmUgYXV0byB1cGxvYWRlZCh5b3Ugc2hvdWxkIHNldCB0aGUgcGljR28gc2VydmVyIHJpZ2h0bHkpXCJcclxuICAgICAgICApXHJcbiAgICAgIClcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51cGxvYWRCeUNsaXBTd2l0Y2gpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51cGxvYWRCeUNsaXBTd2l0Y2ggPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiRGVmYXVsdCB1cGxvYWRlclwiKSlcclxuICAgICAgLnNldERlc2ModChcIkRlZmF1bHQgdXBsb2FkZXJcIikpXHJcbiAgICAgIC5hZGREcm9wZG93bihjYiA9PlxyXG4gICAgICAgIGNiXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiUGljR29cIiwgXCJQaWNHbyhhcHApXCIpXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiUGljR28tQ29yZVwiLCBcIlBpY0dvLUNvcmVcIilcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51cGxvYWRlcilcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZGVyID0gdmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZGVyID09PSBcIlBpY0dvXCIpIHtcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUodChcIlBpY0dvIHNlcnZlclwiKSlcclxuICAgICAgICAuc2V0RGVzYyh0KFwiUGljR28gc2VydmVyIGRlc2NcIikpXHJcbiAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgdGV4dFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIodChcIlBsZWFzZSBpbnB1dCBQaWNHbyBzZXJ2ZXJcIikpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51cGxvYWRTZXJ2ZXIpXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyBrZXkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZFNlcnZlciA9IGtleTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUodChcIlBpY0dvIGRlbGV0ZSBzZXJ2ZXJcIikpXHJcbiAgICAgICAgLnNldERlc2ModChcIlBpY0xpc3QgZGVzY1wiKSlcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcih0KFwiUGxlYXNlIGlucHV0IFBpY0dvIGRlbGV0ZSBzZXJ2ZXJcIikpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWxldGVTZXJ2ZXIpXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyBrZXkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRlbGV0ZVNlcnZlciA9IGtleTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiUmVtb3RlIHNlcnZlciBtb2RlXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiUmVtb3RlIHNlcnZlciBtb2RlIGRlc2NcIikpXHJcbiAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZVNlcnZlck1vZGUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud29ya09uTmV0V29yayA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZGVyID09PSBcIlBpY0dvLUNvcmVcIikge1xyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZSh0KFwiUGljR28tQ29yZSBwYXRoXCIpKVxyXG4gICAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgICAgdChcIlBsZWFzZSBpbnB1dCBQaWNHby1Db3JlIHBhdGgsIGRlZmF1bHQgdXNpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzXCIpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiXCIpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5waWNnb0NvcmVQYXRoKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBpY2dvQ29yZVBhdGggPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGltYWdlIGRlc2Mgc2V0dGluZ1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJJbWFnZSBkZXNjXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiSW1hZ2UgZGVzY1wiKSlcclxuICAgICAgLmFkZERyb3Bkb3duKGNiID0+XHJcbiAgICAgICAgY2JcclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJvcmlnaW5cIiwgdChcInJlc2VydmVcIikpIC8vIOS/neeVmeWFqOmDqFxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcIm5vbmVcIiwgdChcInJlbW92ZSBhbGxcIikpIC8vIOenu+mZpOWFqOmDqFxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcInJlbW92ZURlZmF1bHRcIiwgdChcInJlbW92ZSBkZWZhdWx0XCIpKSAvLyDlj6rnp7vpmaTpu5jorqTljbMgaW1hZ2UucG5nXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW1hZ2VEZXNjKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogXCJvcmlnaW5cIiB8IFwibm9uZVwiIHwgXCJyZW1vdmVEZWZhdWx0XCIpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW1hZ2VEZXNjID0gdmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJJbWFnZSBzaXplIHN1ZmZpeFwiKSlcclxuICAgICAgLnNldERlc2ModChcIkltYWdlIHNpemUgc3VmZml4IERlc2NyaXB0aW9uXCIpKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKHQoXCJQbGVhc2UgaW5wdXQgaW1hZ2Ugc2l6ZSBzdWZmaXhcIikpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW1hZ2VTaXplU3VmZml4KVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIGtleSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmltYWdlU2l6ZVN1ZmZpeCA9IGtleTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiV29yayBvbiBuZXR3b3JrXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiV29yayBvbiBuZXR3b3JrIERlc2NyaXB0aW9uXCIpKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndvcmtPbk5ldFdvcmspXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJDYW4gb25seSB3b3JrIHdoZW4gcmVtb3RlIHNlcnZlciBtb2RlIGlzIG9mZi5cIik7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud29ya09uTmV0V29yayA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndvcmtPbk5ldFdvcmsgPSB2YWx1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdFwiKSlcclxuICAgICAgLnNldERlc2ModChcIk5ldHdvcmsgRG9tYWluIEJsYWNrIExpc3QgRGVzY3JpcHRpb25cIikpXHJcbiAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0QXJlYSA9PlxyXG4gICAgICAgIHRleHRBcmVhXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubmV3V29ya0JsYWNrRG9tYWlucylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5ld1dvcmtCbGFja0RvbWFpbnMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiVXBsb2FkIHdoZW4gY2xpcGJvYXJkIGhhcyBpbWFnZSBhbmQgdGV4dCB0b2dldGhlclwiKSlcclxuICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgdChcclxuICAgICAgICAgIFwiV2hlbiB5b3UgY29weSwgc29tZSBhcHBsaWNhdGlvbiBsaWtlIEV4Y2VsIHdpbGwgaW1hZ2UgYW5kIHRleHQgdG8gY2xpcGJvYXJkLCB5b3UgY2FuIHVwbG9hZCBvciBub3QuXCJcclxuICAgICAgICApXHJcbiAgICAgIClcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcHBseUltYWdlKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBwbHlJbWFnZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0KFwiRGVsZXRlIHNvdXJjZSBmaWxlIGFmdGVyIHlvdSB1cGxvYWQgZmlsZVwiKSlcclxuICAgICAgLnNldERlc2ModChcIkRlbGV0ZSBzb3VyY2UgZmlsZSBpbiBvYiBhc3NldHMgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlLlwiKSlcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWxldGVTb3VyY2UpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWxldGVTb3VyY2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ+WQr+eUqCBQYW5kb2MgRmlnIOagvOW8jycpXHJcbiAgICAgIC5zZXREZXNjKCflvIDlkK/lkI7vvIzkuIrkvKDlm77niYflsIbnlJ/miJAgIVtBbHRdKFVybCl7I2ZpZzrml7bpl7TmiLN9IOagvOW8jycpXHJcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFkZFBhbmRvY0ZpZylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYWRkUGFuZG9jRmlnID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHtcclxuICBNYXJrZG93blZpZXcsXHJcbiAgUGx1Z2luLFxyXG4gIEVkaXRvcixcclxuICBNZW51LFxyXG4gIE1lbnVJdGVtLFxyXG4gIFRGaWxlLFxyXG4gIG5vcm1hbGl6ZVBhdGgsXHJcbiAgTm90aWNlLFxyXG4gIGFkZEljb24sXHJcbiAgTWFya2Rvd25GaWxlSW5mbyxcclxufSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgcmVzb2x2ZSwgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcblxyXG5pbXBvcnQgeyBpc0Fzc2V0VHlwZUFuSW1hZ2UsIGFycmF5VG9PYmplY3QgfSBmcm9tIFwiLi91dGlsc1wiO1xyXG5pbXBvcnQgeyBkb3dubG9hZEFsbEltYWdlRmlsZXMgfSBmcm9tIFwiLi9kb3dubG9hZFwiO1xyXG5pbXBvcnQgeyBVcGxvYWRlck1hbmFnZXIgfSBmcm9tIFwiLi91cGxvYWRlci9pbmRleFwiO1xyXG5pbXBvcnQgeyBQaWNHb0RlbGV0ZXIgfSBmcm9tIFwiLi9kZWxldGVyXCI7XHJcbmltcG9ydCBIZWxwZXIgZnJvbSBcIi4vaGVscGVyXCI7XHJcbmltcG9ydCB7IHQgfSBmcm9tIFwiLi9sYW5nL2hlbHBlcnNcIjtcclxuaW1wb3J0IHsgU2V0dGluZ1RhYiwgUGx1Z2luU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MgfSBmcm9tIFwiLi9zZXR0aW5nXCI7XHJcblxyXG5pbXBvcnQgdHlwZSB7IEltYWdlIH0gZnJvbSBcIi4vdHlwZXNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIGltYWdlQXV0b1VwbG9hZFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcbiAgc2V0dGluZ3M6IFBsdWdpblNldHRpbmdzO1xyXG4gIGhlbHBlcjogSGVscGVyO1xyXG4gIGVkaXRvcjogRWRpdG9yO1xyXG4gIHBpY0dvRGVsZXRlcjogUGljR29EZWxldGVyO1xyXG5cclxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbihERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xyXG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge31cclxuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuXHJcbiAgICB0aGlzLmhlbHBlciA9IG5ldyBIZWxwZXIodGhpcy5hcHApO1xyXG4gICAgdGhpcy5waWNHb0RlbGV0ZXIgPSBuZXcgUGljR29EZWxldGVyKHRoaXMpO1xyXG5cclxuICAgIGFkZEljb24oXHJcbiAgICAgIFwidXBsb2FkXCIsXHJcbiAgICAgIGA8c3ZnIHQ9XCIxNjM2NjMwNzgzNDI5XCIgY2xhc3M9XCJpY29uXCIgdmlld0JveD1cIjAgMCAxMDAgMTAwXCIgdmVyc2lvbj1cIjEuMVwiIHAtaWQ9XCI0NjQ5XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPlxyXG4gICAgICA8cGF0aCBkPVwiTSA3MS42MzggMzUuMzM2IEwgNzkuNDA4IDM1LjMzNiBDIDgzLjcgMzUuMzM2IDg3LjE3OCAzOC42NjIgODcuMTc4IDQyLjc2NSBMIDg3LjE3OCA4NC44NjQgQyA4Ny4xNzggODguOTY5IDgzLjcgOTIuMjk1IDc5LjQwOCA5Mi4yOTUgTCAxNy4yNDkgOTIuMjk1IEMgMTIuOTU3IDkyLjI5NSA5LjQ3OSA4OC45NjkgOS40NzkgODQuODY0IEwgOS40NzkgNDIuNzY1IEMgOS40NzkgMzguNjYyIDEyLjk1NyAzNS4zMzYgMTcuMjQ5IDM1LjMzNiBMIDI1LjAxOSAzNS4zMzYgTCAyNS4wMTkgNDIuNzY1IEwgMTcuMjQ5IDQyLjc2NSBMIDE3LjI0OSA4NC44NjQgTCA3OS40MDggODQuODY0IEwgNzkuNDA4IDQyLjc2NSBMIDcxLjYzOCA0Mi43NjUgTCA3MS42MzggMzUuMzM2IFogTSA0OS4wMTQgMTAuMTc5IEwgNjcuMzI2IDI3LjY4OCBMIDYxLjgzNSAzMi45NDIgTCA1Mi44NDkgMjQuMzUyIEwgNTIuODQ5IDU5LjczMSBMIDQ1LjA3OCA1OS43MzEgTCA0NS4wNzggMjQuNDU1IEwgMzYuMTk0IDMyLjk0NyBMIDMwLjcwMiAyNy42OTIgTCA0OS4wMTIgMTAuMTgxIFpcIiBwLWlkPVwiNDY1MFwiIGZpbGw9XCIjOGE4YThhXCI+PC9wYXRoPlxyXG4gICAgPC9zdmc+YFxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJVcGxvYWQgYWxsIGltYWdlc1wiLFxyXG4gICAgICBuYW1lOiBcIlVwbG9hZCBhbGwgaW1hZ2VzXCIsXHJcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgIGxldCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcclxuICAgICAgICBpZiAobGVhZikge1xyXG4gICAgICAgICAgaWYgKCFjaGVja2luZykge1xyXG4gICAgICAgICAgICB0aGlzLnVwbG9hZEFsbEZpbGUoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcIkRvd25sb2FkIGFsbCBpbWFnZXNcIixcclxuICAgICAgbmFtZTogXCJEb3dubG9hZCBhbGwgaW1hZ2VzXCIsXHJcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZzogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgIGxldCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcclxuICAgICAgICBpZiAobGVhZikge1xyXG4gICAgICAgICAgaWYgKCFjaGVja2luZykge1xyXG4gICAgICAgICAgICBkb3dubG9hZEFsbEltYWdlRmlsZXModGhpcyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnNldHVwUGFzdGVIYW5kbGVyKCk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRmlsZU1lbnUoKTtcclxuICAgIHRoaXMucmVnaXN0ZXJTZWxlY3Rpb24oKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIOiOt+WPluW9k+WJjeS9v+eUqOeahOS4iuS8oOWZqFxyXG4gICAqL1xyXG4gIGdldFVwbG9hZGVyKCkge1xyXG4gICAgY29uc3QgdXBsb2FkZXIgPSBuZXcgVXBsb2FkZXJNYW5hZ2VyKHRoaXMuc2V0dGluZ3MudXBsb2FkZXIsIHRoaXMpO1xyXG5cclxuICAgIHJldHVybiB1cGxvYWRlcjtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIOS4iuS8oOWbvueJh1xyXG4gICAqL1xyXG4gIHVwbG9hZChpbWFnZXM6IEltYWdlW10gfCBzdHJpbmdbXSkge1xyXG4gICAgbGV0IHVwbG9hZGVyID0gdGhpcy5nZXRVcGxvYWRlcigpO1xyXG4gICAgcmV0dXJuIHVwbG9hZGVyLnVwbG9hZChpbWFnZXMpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog6YCa6L+H5Ymq6LS05p2/5LiK5Lyg5Zu+54mHXHJcbiAgICovXHJcbiAgdXBsb2FkQnlDbGlwYm9hcmQoZmlsZUxpc3Q/OiBGaWxlTGlzdCkge1xyXG4gICAgbGV0IHVwbG9hZGVyID0gdGhpcy5nZXRVcGxvYWRlcigpO1xyXG4gICAgcmV0dXJuIHVwbG9hZGVyLnVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0KTtcclxuICB9XHJcblxyXG4gIHJlZ2lzdGVyU2VsZWN0aW9uKCkge1xyXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxyXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXHJcbiAgICAgICAgXCJlZGl0b3ItbWVudVwiLFxyXG4gICAgICAgIChtZW51OiBNZW51LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykgPT4ge1xyXG4gICAgICAgICAgaWYgKHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xyXG4gICAgICAgICAgaWYgKHNlbGVjdGlvbikge1xyXG4gICAgICAgICAgICBjb25zdCBtYXJrZG93blJlZ2V4ID0gLyFcXFsuKlxcXVxcKCguKilcXCkvZztcclxuICAgICAgICAgICAgY29uc3QgbWFya2Rvd25NYXRjaCA9IG1hcmtkb3duUmVnZXguZXhlYyhzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICBpZiAobWFya2Rvd25NYXRjaCAmJiBtYXJrZG93bk1hdGNoLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgICBjb25zdCBtYXJrZG93blVybCA9IG1hcmtkb3duTWF0Y2hbMV07XHJcbiAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcy5maW5kKFxyXG4gICAgICAgICAgICAgICAgICAoaXRlbTogeyBpbWdVcmw6IHN0cmluZyB9KSA9PiBpdGVtLmltZ1VybCA9PT0gbWFya2Rvd25VcmxcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUmVtb3ZlTWVudShtZW51LCBtYXJrZG93blVybCwgZWRpdG9yKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBhZGRSZW1vdmVNZW51ID0gKG1lbnU6IE1lbnUsIGltZ1BhdGg6IHN0cmluZywgZWRpdG9yOiBFZGl0b3IpID0+IHtcclxuICAgIG1lbnUuYWRkSXRlbSgoaXRlbTogTWVudUl0ZW0pID0+XHJcbiAgICAgIGl0ZW1cclxuICAgICAgICAuc2V0SWNvbihcInRyYXNoLTJcIilcclxuICAgICAgICAuc2V0VGl0bGUodChcIkRlbGV0ZSBpbWFnZSB1c2luZyBQaWNMaXN0XCIpKVxyXG4gICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkSXRlbSA9IHRoaXMuc2V0dGluZ3MudXBsb2FkZWRJbWFnZXMuZmluZChcclxuICAgICAgICAgICAgICAoaXRlbTogeyBpbWdVcmw6IHN0cmluZyB9KSA9PiBpdGVtLmltZ1VybCA9PT0gaW1nUGF0aFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRJdGVtKSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5waWNHb0RlbGV0ZXIuZGVsZXRlSW1hZ2UoW3NlbGVjdGVkSXRlbV0pO1xyXG4gICAgICAgICAgICAgIGlmIChyZXMuc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSh0KFwiRGVsZXRlIHN1Y2Nlc3NmdWxseVwiKSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKFwiXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcyA9XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MudXBsb2FkZWRJbWFnZXMuZmlsdGVyKFxyXG4gICAgICAgICAgICAgICAgICAgIChpdGVtOiB7IGltZ1VybDogc3RyaW5nIH0pID0+IGl0ZW0uaW1nVXJsICE9PSBpbWdQYXRoXHJcbiAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKHQoXCJEZWxldGUgZmFpbGVkXCIpKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKHQoXCJFcnJvciwgY291bGQgbm90IGRlbGV0ZVwiKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICk7XHJcbiAgfTtcclxuXHJcbiAgcmVnaXN0ZXJGaWxlTWVudSgpIHtcclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFxyXG4gICAgICAgIFwiZmlsZS1tZW51XCIsXHJcbiAgICAgICAgKG1lbnU6IE1lbnUsIGZpbGU6IFRGaWxlLCBzb3VyY2U6IHN0cmluZywgbGVhZikgPT4ge1xyXG4gICAgICAgICAgaWYgKHNvdXJjZSA9PT0gXCJjYW52YXMtbWVudVwiKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICBpZiAoIWlzQXNzZXRUeXBlQW5JbWFnZShmaWxlLnBhdGgpKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgICAgbWVudS5hZGRJdGVtKChpdGVtOiBNZW51SXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpdGVtXHJcbiAgICAgICAgICAgICAgLnNldFRpdGxlKHQoXCJ1cGxvYWRcIikpXHJcbiAgICAgICAgICAgICAgLnNldEljb24oXCJ1cGxvYWRcIilcclxuICAgICAgICAgICAgICAub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsZU1lbnVVcGxvYWQoZmlsZSk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBmaWxlTWVudVVwbG9hZChmaWxlOiBURmlsZSkge1xyXG4gICAgbGV0IGltYWdlTGlzdDogSW1hZ2VbXSA9IFtdO1xyXG4gICAgY29uc3QgZmlsZUFycmF5ID0gdGhpcy5oZWxwZXIuZ2V0QWxsRmlsZXMoKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGZpbGVBcnJheSkge1xyXG4gICAgICBjb25zdCBpbWFnZU5hbWUgPSBtYXRjaC5uYW1lO1xyXG4gICAgICBjb25zdCBlbmNvZGVkVXJpID0gbWF0Y2gucGF0aDtcclxuXHJcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUoZGVjb2RlVVJJKGVuY29kZWRVcmkpKTtcclxuXHJcbiAgICAgIGlmIChmaWxlICYmIGZpbGUubmFtZSA9PT0gZmlsZU5hbWUpIHtcclxuICAgICAgICBpZiAoaXNBc3NldFR5cGVBbkltYWdlKGZpbGUucGF0aCkpIHtcclxuICAgICAgICAgIGltYWdlTGlzdC5wdXNoKHtcclxuICAgICAgICAgICAgcGF0aDogZmlsZS5wYXRoLFxyXG4gICAgICAgICAgICBuYW1lOiBpbWFnZU5hbWUsXHJcbiAgICAgICAgICAgIHNvdXJjZTogbWF0Y2guc291cmNlLFxyXG4gICAgICAgICAgICBmaWxlOiBmaWxlLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGltYWdlTGlzdC5sZW5ndGggPT09IDApIHtcclxuICAgICAgbmV3IE5vdGljZSh0KFwiQ2FuIG5vdCBmaW5kIGltYWdlIGZpbGVcIikpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy51cGxvYWQoaW1hZ2VMaXN0KS50aGVuKHJlcyA9PiB7XHJcbiAgICAgIGlmICghcmVzLnN1Y2Nlc3MpIHtcclxuICAgICAgICBuZXcgTm90aWNlKFwiVXBsb2FkIGVycm9yXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHVwbG9hZFVybExpc3QgPSByZXMucmVzdWx0O1xyXG4gICAgICB0aGlzLnJlcGxhY2VJbWFnZShpbWFnZUxpc3QsIHVwbG9hZFVybExpc3QpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmaWx0ZXJGaWxlKGZpbGVBcnJheTogSW1hZ2VbXSkge1xyXG4gICAgY29uc3QgaW1hZ2VMaXN0OiBJbWFnZVtdID0gW107XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBmaWxlQXJyYXkpIHtcclxuICAgICAgaWYgKG1hdGNoLnBhdGguc3RhcnRzV2l0aChcImh0dHBcIikpIHtcclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy53b3JrT25OZXRXb3JrKSB7XHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICF0aGlzLmhlbHBlci5oYXNCbGFja0RvbWFpbihcclxuICAgICAgICAgICAgICBtYXRjaC5wYXRoLFxyXG4gICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MubmV3V29ya0JsYWNrRG9tYWluc1xyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgaW1hZ2VMaXN0LnB1c2goe1xyXG4gICAgICAgICAgICAgIHBhdGg6IG1hdGNoLnBhdGgsXHJcbiAgICAgICAgICAgICAgbmFtZTogbWF0Y2gubmFtZSxcclxuICAgICAgICAgICAgICBzb3VyY2U6IG1hdGNoLnNvdXJjZSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGltYWdlTGlzdC5wdXNoKHtcclxuICAgICAgICAgIHBhdGg6IG1hdGNoLnBhdGgsXHJcbiAgICAgICAgICBuYW1lOiBtYXRjaC5uYW1lLFxyXG4gICAgICAgICAgc291cmNlOiBtYXRjaC5zb3VyY2UsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaW1hZ2VMaXN0O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog5pu/5o2i5LiK5Lyg55qE5Zu+54mHXHJcbiAgICovXHJcbiAgcmVwbGFjZUltYWdlKGltYWdlTGlzdDogSW1hZ2VbXSwgdXBsb2FkVXJsTGlzdDogc3RyaW5nW10pIHtcclxuICAgIGxldCBjb250ZW50ID0gdGhpcy5oZWxwZXIuZ2V0VmFsdWUoKTtcclxuXHJcbiAgICAvLyAtLS0g44CQ5L+u5pS55byA5aeL77ya5aKe5YqgIGluZGV4IOWPguaVsOOAkSAtLS1cclxuICAgIGltYWdlTGlzdC5tYXAoKGl0ZW0sIGluZGV4KSA9PiB7XHJcbiAgICAgIGNvbnN0IHVwbG9hZEltYWdlID0gdXBsb2FkVXJsTGlzdC5zaGlmdCgpO1xyXG5cclxuICAgICAgbGV0IG5hbWUgPSB0aGlzLmhhbmRsZU5hbWUoaXRlbS5uYW1lKTtcclxuXHJcbiAgICAgIGxldCByZXBsYWNlbWVudCA9IFwiXCI7XHJcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmFkZFBhbmRvY0ZpZykge1xyXG4gICAgICAgIC8vIOaJuemHj+S4iuS8oOaXtu+8jOS4uuS6humYsuatouaXtumXtOaIs+WujOWFqOmHjeWkje+8jOWcqOWQjumdouWKoOS4gOS4quW6j+WPt1xyXG4gICAgICAgIGNvbnN0IHRpbWVzdGFtcCA9ICh3aW5kb3cgYXMgYW55KS5tb21lbnQoKS5mb3JtYXQoXCJZWVlZTU1EREhIbW1zc1wiKSArIChpbmRleCA+IDAgPyBgLSR7aW5kZXh9YCA6IFwiXCIpO1xyXG4gICAgICAgIHJlcGxhY2VtZW50ID0gYCFbJHtuYW1lfV0oJHt1cGxvYWRJbWFnZX0peyNmaWc6JHt0aW1lc3RhbXB9fWA7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmVwbGFjZW1lbnQgPSBgIVske25hbWV9XSgke3VwbG9hZEltYWdlfSlgO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDms6jmhI/vvJrov5nph4znlKggcmVwbGFjZW1lbnQg5pu/5o2i5Y6f5p2l55qE5Zu+54mH6ZO+5o6lXHJcbiAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2VBbGwoaXRlbS5zb3VyY2UsIHJlcGxhY2VtZW50KTtcclxuICAgIH0pO1xyXG4gICAgLy8gLS0tIOOAkOS/ruaUuee7k+adn+OAkSAtLS1cclxuXHJcbiAgICB0aGlzLmhlbHBlci5zZXRWYWx1ZShjb250ZW50KTtcclxuXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVTb3VyY2UpIHtcclxuICAgICAgaW1hZ2VMaXN0Lm1hcChpbWFnZSA9PiB7XHJcbiAgICAgICAgaWYgKGltYWdlLmZpbGUgJiYgIWltYWdlLnBhdGguc3RhcnRzV2l0aChcImh0dHBcIikpIHtcclxuICAgICAgICAgIHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnRyYXNoRmlsZShpbWFnZS5maWxlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog5LiK5Lyg5omA5pyJ5Zu+54mHXHJcbiAgICovXHJcbiAgdXBsb2FkQWxsRmlsZSgpIHtcclxuICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xyXG4gICAgY29uc3QgZmlsZU1hcCA9IGFycmF5VG9PYmplY3QodGhpcy5hcHAudmF1bHQuZ2V0RmlsZXMoKSwgXCJuYW1lXCIpO1xyXG4gICAgY29uc3QgZmlsZVBhdGhNYXAgPSBhcnJheVRvT2JqZWN0KHRoaXMuYXBwLnZhdWx0LmdldEZpbGVzKCksIFwicGF0aFwiKTtcclxuICAgIGxldCBpbWFnZUxpc3Q6IChJbWFnZSAmIHsgZmlsZTogVEZpbGUgfCBudWxsIH0pW10gPSBbXTtcclxuICAgIGNvbnN0IGZpbGVBcnJheSA9IHRoaXMuZmlsdGVyRmlsZSh0aGlzLmhlbHBlci5nZXRBbGxGaWxlcygpKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGZpbGVBcnJheSkge1xyXG4gICAgICBjb25zdCBpbWFnZU5hbWUgPSBtYXRjaC5uYW1lO1xyXG4gICAgICBjb25zdCB1cmkgPSBkZWNvZGVVUkkobWF0Y2gucGF0aCk7XHJcblxyXG4gICAgICBpZiAodXJpLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XHJcbiAgICAgICAgaW1hZ2VMaXN0LnB1c2goe1xyXG4gICAgICAgICAgcGF0aDogbWF0Y2gucGF0aCxcclxuICAgICAgICAgIG5hbWU6IGltYWdlTmFtZSxcclxuICAgICAgICAgIHNvdXJjZTogbWF0Y2guc291cmNlLFxyXG4gICAgICAgICAgZmlsZTogbnVsbCxcclxuICAgICAgICB9KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKHVyaSk7XHJcbiAgICAgICAgbGV0IGZpbGU6IFRGaWxlIHwgdW5kZWZpbmVkIHwgbnVsbDtcclxuICAgICAgICAvLyDkvJjlhYjljLnphY3nu53lr7not6/lvoRcclxuICAgICAgICBpZiAoZmlsZVBhdGhNYXBbdXJpXSkge1xyXG4gICAgICAgICAgZmlsZSA9IGZpbGVQYXRoTWFwW3VyaV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDnm7jlr7not6/lvoRcclxuICAgICAgICBpZiAoKCFmaWxlICYmIHVyaS5zdGFydHNXaXRoKFwiLi9cIikpIHx8IHVyaS5zdGFydHNXaXRoKFwiLi4vXCIpKSB7XHJcbiAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZVBhdGgoXHJcbiAgICAgICAgICAgIHJlc29sdmUoZGlybmFtZShhY3RpdmVGaWxlLnBhdGgpLCB1cmkpXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIGZpbGUgPSBmaWxlUGF0aE1hcFtmaWxlUGF0aF07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDlsL3lj6/og73nn63ot6/lvoRcclxuICAgICAgICBpZiAoIWZpbGUpIHtcclxuICAgICAgICAgIGZpbGUgPSBmaWxlTWFwW2ZpbGVOYW1lXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChmaWxlKSB7XHJcbiAgICAgICAgICBpZiAoaXNBc3NldFR5cGVBbkltYWdlKGZpbGUucGF0aCkpIHtcclxuICAgICAgICAgICAgaW1hZ2VMaXN0LnB1c2goe1xyXG4gICAgICAgICAgICAgIHBhdGg6IG5vcm1hbGl6ZVBhdGgoZmlsZS5wYXRoKSxcclxuICAgICAgICAgICAgICBuYW1lOiBpbWFnZU5hbWUsXHJcbiAgICAgICAgICAgICAgc291cmNlOiBtYXRjaC5zb3VyY2UsXHJcbiAgICAgICAgICAgICAgZmlsZTogZmlsZSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGltYWdlTGlzdC5sZW5ndGggPT09IDApIHtcclxuICAgICAgbmV3IE5vdGljZSh0KFwiQ2FuIG5vdCBmaW5kIGltYWdlIGZpbGVcIikpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBuZXcgTm90aWNlKGBIYXZlIGZvdW5kICR7aW1hZ2VMaXN0Lmxlbmd0aH0gaW1hZ2VzYCk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy51cGxvYWQoaW1hZ2VMaXN0KS50aGVuKHJlcyA9PiB7XHJcbiAgICAgIGxldCB1cGxvYWRVcmxMaXN0ID0gcmVzLnJlc3VsdDtcclxuICAgICAgaWYgKGltYWdlTGlzdC5sZW5ndGggIT09IHVwbG9hZFVybExpc3QubGVuZ3RoKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcclxuICAgICAgICAgIHQoXCJXYXJuaW5nOiB1cGxvYWQgZmlsZXMgaXMgZGlmZmVyZW50IG9mIHJlY2l2ZXIgZmlsZXMgZnJvbSBhcGlcIilcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBjdXJyZW50RmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICAgIGlmIChhY3RpdmVGaWxlLnBhdGggIT09IGN1cnJlbnRGaWxlLnBhdGgpIHtcclxuICAgICAgICBuZXcgTm90aWNlKHQoXCJGaWxlIGhhcyBiZWVuIGNoYW5nZWRkLCB1cGxvYWQgZmFpbHVyZVwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLnJlcGxhY2VJbWFnZShpbWFnZUxpc3QsIHVwbG9hZFVybExpc3QpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzZXR1cFBhc3RlSGFuZGxlcigpIHtcclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFxyXG4gICAgICAgIFwiZWRpdG9yLXBhc3RlXCIsXHJcbiAgICAgICAgKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBtYXJrZG93blZpZXc6IE1hcmtkb3duVmlldykgPT4ge1xyXG4gICAgICAgICAgY29uc3QgYWxsb3dVcGxvYWQgPSB0aGlzLmhlbHBlci5nZXRGcm9udG1hdHRlclZhbHVlKFxyXG4gICAgICAgICAgICBcImltYWdlLWF1dG8tdXBsb2FkXCIsXHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MudXBsb2FkQnlDbGlwU3dpdGNoXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIGxldCBmaWxlcyA9IGV2dC5jbGlwYm9hcmREYXRhLmZpbGVzO1xyXG4gICAgICAgICAgaWYgKCFhbGxvd1VwbG9hZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8g5Ymq6LS05p2/5YaF5a655pyJbWTmoLzlvI/nmoTlm77niYfml7ZcclxuICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLndvcmtPbk5ldFdvcmspIHtcclxuICAgICAgICAgICAgY29uc3QgY2xpcGJvYXJkVmFsdWUgPSBldnQuY2xpcGJvYXJkRGF0YS5nZXREYXRhKFwidGV4dC9wbGFpblwiKTtcclxuICAgICAgICAgICAgY29uc3QgaW1hZ2VMaXN0ID0gdGhpcy5oZWxwZXJcclxuICAgICAgICAgICAgICAuZ2V0SW1hZ2VMaW5rKGNsaXBib2FyZFZhbHVlKVxyXG4gICAgICAgICAgICAgIC5maWx0ZXIoaW1hZ2UgPT4gaW1hZ2UucGF0aC5zdGFydHNXaXRoKFwiaHR0cFwiKSlcclxuICAgICAgICAgICAgICAuZmlsdGVyKFxyXG4gICAgICAgICAgICAgICAgaW1hZ2UgPT5cclxuICAgICAgICAgICAgICAgICAgIXRoaXMuaGVscGVyLmhhc0JsYWNrRG9tYWluKFxyXG4gICAgICAgICAgICAgICAgICAgIGltYWdlLnBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5uZXdXb3JrQmxhY2tEb21haW5zXHJcbiAgICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKGltYWdlTGlzdC5sZW5ndGggIT09IDApIHtcclxuICAgICAgICAgICAgICB0aGlzLnVwbG9hZChpbWFnZUxpc3QpLnRoZW4ocmVzID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCB1cGxvYWRVcmxMaXN0ID0gcmVzLnJlc3VsdDtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVwbGFjZUltYWdlKGltYWdlTGlzdCwgdXBsb2FkVXJsTGlzdCk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyDliarotLTmnb/kuK3mmK/lm77niYfml7bov5vooYzkuIrkvKBcclxuICAgICAgICAgIGlmICh0aGlzLmNhblVwbG9hZChldnQuY2xpcGJvYXJkRGF0YSkpIHtcclxuICAgICAgICAgICAgdGhpcy51cGxvYWRGaWxlQW5kRW1iZWRJbWd1ckltYWdlKFxyXG4gICAgICAgICAgICAgIGVkaXRvcixcclxuICAgICAgICAgICAgICBhc3luYyAoZWRpdG9yOiBFZGl0b3IsIHBhc3RlSWQ6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IHJlczogYW55O1xyXG4gICAgICAgICAgICAgICAgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRCeUNsaXBib2FyZChldnQuY2xpcGJvYXJkRGF0YS5maWxlcyk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHJlcy5jb2RlICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRmFpbGVkVXBsb2FkKGVkaXRvciwgcGFzdGVJZCwgcmVzLm1zZyk7XHJcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHJlcy5kYXRhO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBldnQuY2xpcGJvYXJkRGF0YVxyXG4gICAgICAgICAgICApLmNhdGNoKCk7XHJcbiAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgKVxyXG4gICAgKTtcclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFxyXG4gICAgICAgIFwiZWRpdG9yLWRyb3BcIixcclxuICAgICAgICBhc3luYyAoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBtYXJrZG93blZpZXc6IE1hcmtkb3duVmlldykgPT4ge1xyXG4gICAgICAgICAgLy8gd2hlbiBjdHJsIGtleSBpcyBwcmVzc2VkLCBkbyBub3QgdXBsb2FkIGltYWdlLCBiZWNhdXNlIGl0IGlzIHVzZWQgdG8gc2V0IGxvY2FsIGZpbGVcclxuICAgICAgICAgIGlmIChldnQuY3RybEtleSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb25zdCBhbGxvd1VwbG9hZCA9IHRoaXMuaGVscGVyLmdldEZyb250bWF0dGVyVmFsdWUoXHJcbiAgICAgICAgICAgIFwiaW1hZ2UtYXV0by11cGxvYWRcIixcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRCeUNsaXBTd2l0Y2hcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKCFhbGxvd1VwbG9hZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbGV0IGZpbGVzID0gZXZ0LmRhdGFUcmFuc2Zlci5maWxlcztcclxuICAgICAgICAgIGlmIChmaWxlcy5sZW5ndGggIT09IDAgJiYgZmlsZXNbMF0udHlwZS5zdGFydHNXaXRoKFwiaW1hZ2VcIikpIHtcclxuICAgICAgICAgICAgbGV0IHNlbmRGaWxlczogQXJyYXk8c3RyaW5nPiA9IFtdO1xyXG4gICAgICAgICAgICBsZXQgZmlsZXMgPSBldnQuZGF0YVRyYW5zZmVyLmZpbGVzO1xyXG4gICAgICAgICAgICBBcnJheS5mcm9tKGZpbGVzKS5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgIGlmIChpdGVtLnBhdGgpIHtcclxuICAgICAgICAgICAgICAgIHNlbmRGaWxlcy5wdXNoKGl0ZW0ucGF0aCk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2ViVXRpbHMgfSA9IHJlcXVpcmUoXCJlbGVjdHJvblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSB3ZWJVdGlscy5nZXRQYXRoRm9yRmlsZShpdGVtKTtcclxuICAgICAgICAgICAgICAgIHNlbmRGaWxlcy5wdXNoKHBhdGgpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMudXBsb2FkKHNlbmRGaWxlcyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGF0YS5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgZGF0YS5yZXN1bHQubWFwKCh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGFzdGVJZCA9IChNYXRoLnJhbmRvbSgpICsgMSkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA1KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5zZXJ0VGVtcG9yYXJ5VGV4dChlZGl0b3IsIHBhc3RlSWQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWJlZE1hcmtEb3duSW1hZ2UoZWRpdG9yLCBwYXN0ZUlkLCB2YWx1ZSwgZmlsZXNbMF0ubmFtZSk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShcIlVwbG9hZCBlcnJvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgKVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGNhblVwbG9hZChjbGlwYm9hcmREYXRhOiBEYXRhVHJhbnNmZXIpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MuYXBwbHlJbWFnZTtcclxuICAgIGNvbnN0IGZpbGVzID0gY2xpcGJvYXJkRGF0YS5maWxlcztcclxuICAgIGNvbnN0IHRleHQgPSBjbGlwYm9hcmREYXRhLmdldERhdGEoXCJ0ZXh0XCIpO1xyXG5cclxuICAgIGNvbnN0IGhhc0ltYWdlRmlsZSA9XHJcbiAgICAgIGZpbGVzLmxlbmd0aCAhPT0gMCAmJiBmaWxlc1swXS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZVwiKTtcclxuICAgIGlmIChoYXNJbWFnZUZpbGUpIHtcclxuICAgICAgaWYgKCEhdGV4dCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmFwcGx5SW1hZ2U7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHVwbG9hZEZpbGVBbmRFbWJlZEltZ3VySW1hZ2UoXHJcbiAgICBlZGl0b3I6IEVkaXRvcixcclxuICAgIGNhbGxiYWNrOiBGdW5jdGlvbixcclxuICAgIGNsaXBib2FyZERhdGE6IERhdGFUcmFuc2ZlclxyXG4gICkge1xyXG4gICAgbGV0IHBhc3RlSWQgPSAoTWF0aC5yYW5kb20oKSArIDEpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgNSk7XHJcbiAgICB0aGlzLmluc2VydFRlbXBvcmFyeVRleHQoZWRpdG9yLCBwYXN0ZUlkKTtcclxuICAgIGNvbnN0IG5hbWUgPSBjbGlwYm9hcmREYXRhLmZpbGVzWzBdLm5hbWU7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsID0gYXdhaXQgY2FsbGJhY2soZWRpdG9yLCBwYXN0ZUlkKTtcclxuICAgICAgdGhpcy5lbWJlZE1hcmtEb3duSW1hZ2UoZWRpdG9yLCBwYXN0ZUlkLCB1cmwsIG5hbWUpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICB0aGlzLmhhbmRsZUZhaWxlZFVwbG9hZChlZGl0b3IsIHBhc3RlSWQsIGUpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaW5zZXJ0VGVtcG9yYXJ5VGV4dChlZGl0b3I6IEVkaXRvciwgcGFzdGVJZDogc3RyaW5nKSB7XHJcbiAgICBsZXQgcHJvZ3Jlc3NUZXh0ID0gaW1hZ2VBdXRvVXBsb2FkUGx1Z2luLnByb2dyZXNzVGV4dEZvcihwYXN0ZUlkKTtcclxuICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHByb2dyZXNzVGV4dCArIFwiXFxuXCIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzdGF0aWMgcHJvZ3Jlc3NUZXh0Rm9yKGlkOiBzdHJpbmcpIHtcclxuICAgIHJldHVybiBgIVtVcGxvYWRpbmcgZmlsZS4uLiR7aWR9XSgpYDtcclxuICB9XHJcblxyXG4gIGVtYmVkTWFya0Rvd25JbWFnZShcclxuICAgIGVkaXRvcjogRWRpdG9yLFxyXG4gICAgcGFzdGVJZDogc3RyaW5nLFxyXG4gICAgaW1hZ2VVcmw6IGFueSxcclxuICAgIG5hbWU6IHN0cmluZyA9IFwiXCJcclxuICApIHtcclxuICAgIGxldCBwcm9ncmVzc1RleHQgPSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4ucHJvZ3Jlc3NUZXh0Rm9yKHBhc3RlSWQpO1xyXG4gICAgbmFtZSA9IHRoaXMuaGFuZGxlTmFtZShuYW1lKTtcclxuXHJcbiAgICBsZXQgbWFya0Rvd25JbWFnZSA9IFwiXCI7XHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5hZGRQYW5kb2NGaWcpIHtcclxuICAgICAgLy8g6I635Y+W5b2T5YmN5pe26Ze05oizICjkvb/nlKggd2luZG93IGFzIGFueSDop4Tpgb8gVHlwZVNjcmlwdCDnsbvlnovmo4Dmn6XmiqXplJkpXHJcbiAgICAgIGNvbnN0IHRpbWVzdGFtcCA9ICh3aW5kb3cgYXMgYW55KS5tb21lbnQoKS5mb3JtYXQoXCJZWVlZTU1EREhIbW1zc1wiKTtcclxuICAgICAgbWFya0Rvd25JbWFnZSA9IGAhWyR7bmFtZX1dKCR7aW1hZ2VVcmx9KXsjZmlnOiR7dGltZXN0YW1wfX1gO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8g5aaC5p6c5byA5YWz5YWz6Zet77yM5L+d5oyB5Y6f5qC3XHJcbiAgICAgIG1hcmtEb3duSW1hZ2UgPSBgIVske25hbWV9XSgke2ltYWdlVXJsfSlgO1xyXG4gICAgfVxyXG4gICAgLy8gLS0tIOOAkOS/ruaUuee7k+adn+OAkSAtLS1cclxuXHJcbiAgICBpbWFnZUF1dG9VcGxvYWRQbHVnaW4ucmVwbGFjZUZpcnN0T2NjdXJyZW5jZShcclxuICAgICAgZWRpdG9yLFxyXG4gICAgICBwcm9ncmVzc1RleHQsXHJcbiAgICAgIG1hcmtEb3duSW1hZ2VcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBoYW5kbGVGYWlsZWRVcGxvYWQoZWRpdG9yOiBFZGl0b3IsIHBhc3RlSWQ6IHN0cmluZywgcmVhc29uOiBhbnkpIHtcclxuICAgIG5ldyBOb3RpY2UocmVhc29uKTtcclxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgcmVxdWVzdDogXCIsIHJlYXNvbik7XHJcbiAgICBsZXQgcHJvZ3Jlc3NUZXh0ID0gaW1hZ2VBdXRvVXBsb2FkUGx1Z2luLnByb2dyZXNzVGV4dEZvcihwYXN0ZUlkKTtcclxuICAgIGltYWdlQXV0b1VwbG9hZFBsdWdpbi5yZXBsYWNlRmlyc3RPY2N1cnJlbmNlKFxyXG4gICAgICBlZGl0b3IsXHJcbiAgICAgIHByb2dyZXNzVGV4dCxcclxuICAgICAgXCLimqDvuI91cGxvYWQgZmFpbGVkLCBjaGVjayBkZXYgY29uc29sZVwiXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgaGFuZGxlTmFtZShuYW1lOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IGltYWdlU2l6ZVN1ZmZpeCA9IHRoaXMuc2V0dGluZ3MuaW1hZ2VTaXplU3VmZml4IHx8IFwiXCI7XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuaW1hZ2VEZXNjID09PSBcIm9yaWdpblwiKSB7XHJcbiAgICAgIHJldHVybiBgJHtuYW1lfSR7aW1hZ2VTaXplU3VmZml4fWA7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2V0dGluZ3MuaW1hZ2VEZXNjID09PSBcIm5vbmVcIikge1xyXG4gICAgICByZXR1cm4gXCJcIjtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5zZXR0aW5ncy5pbWFnZURlc2MgPT09IFwicmVtb3ZlRGVmYXVsdFwiKSB7XHJcbiAgICAgIGlmIChuYW1lID09PSBcImltYWdlLnBuZ1wiKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGAke25hbWV9JHtpbWFnZVNpemVTdWZmaXh9YDtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGAke25hbWV9JHtpbWFnZVNpemVTdWZmaXh9YDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHN0YXRpYyByZXBsYWNlRmlyc3RPY2N1cnJlbmNlKFxyXG4gICAgZWRpdG9yOiBFZGl0b3IsXHJcbiAgICB0YXJnZXQ6IHN0cmluZyxcclxuICAgIHJlcGxhY2VtZW50OiBzdHJpbmdcclxuICApIHtcclxuICAgIGxldCBsaW5lcyA9IGVkaXRvci5nZXRWYWx1ZSgpLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBsZXQgY2ggPSBsaW5lc1tpXS5pbmRleE9mKHRhcmdldCk7XHJcbiAgICAgIGlmIChjaCAhPSAtMSkge1xyXG4gICAgICAgIGxldCBmcm9tID0geyBsaW5lOiBpLCBjaDogY2ggfTtcclxuICAgICAgICBsZXQgdG8gPSB7IGxpbmU6IGksIGNoOiBjaCArIHRhcmdldC5sZW5ndGggfTtcclxuICAgICAgICBlZGl0b3IucmVwbGFjZVJhbmdlKHJlcGxhY2VtZW50LCBmcm9tLCB0byk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbImV4dG5hbWUiLCJCdWZmZXIiLCJzdHJ0b2szLmZyb21CdWZmZXIiLCJzdHJ0b2szLmZyb21TdHJlYW0iLCJzdHJ0b2szLkVuZE9mU3RyZWFtRXJyb3IiLCJUb2tlbi5TdHJpbmdUeXBlIiwiVG9rZW4uVUlOVDgiLCJUb2tlbi5JTlQzMl9CRSIsIlRva2VuLlVJTlQ2NF9MRSIsIlRva2VuLlVJTlQxNl9CRSIsIlRva2VuLlVJTlQxNl9MRSIsIlRva2VuLlVJTlQzMl9CRSIsIlRva2VuLlVJTlQzMl9MRSIsIm1vbWVudCIsInBhcnNlIiwibm9ybWFsaXplUGF0aCIsInJlbGF0aXZlIiwiTm90aWNlIiwicmVxdWVzdFVybCIsImpvaW4iLCJnZXRCbG9iQXJyYXlCdWZmZXIiLCJQbGF0Zm9ybSIsIk1hcmtkb3duVmlldyIsIlBsdWdpblNldHRpbmdUYWIiLCJTZXR0aW5nIiwiUGx1Z2luIiwiYWRkSWNvbiIsIlRGaWxlIiwiYmFzZW5hbWUiLCJyZXNvbHZlIiwiZGlybmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0NBMEJBLFNBQVMsVUFBVSxDQUFDLElBQUksRUFBRTtBQUMxQixHQUFFLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFO0FBQ2hDLEtBQUksTUFBTSxJQUFJLFNBQVMsQ0FBQyxrQ0FBa0MsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xGO0FBQ0E7O0FBRUE7QUFDQSxDQUFBLFNBQVMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtHQUNsRCxJQUFJLEdBQUcsR0FBRyxFQUFFO0dBQ1osSUFBSSxpQkFBaUIsR0FBRyxDQUFDO0FBQzNCLEdBQUUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0dBQ2xCLElBQUksSUFBSSxHQUFHLENBQUM7QUFDZCxHQUFFLElBQUksSUFBSTtBQUNWLEdBQUUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDekMsS0FBSSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTTtBQUN2QixPQUFNLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztVQUN0QixJQUFJLElBQUksS0FBSyxFQUFFO09BQ2xCO0FBQ047T0FDTSxJQUFJLEdBQUcsRUFBRTtBQUNmLEtBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO09BQ3JCLElBQUksU0FBUyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRSxDQUV0QyxNQUFNLElBQUksU0FBUyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRTtBQUNwRCxTQUFRLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksaUJBQWlCLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUTtBQUNySixXQUFVLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7YUFDbEIsSUFBSSxjQUFjLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7YUFDekMsSUFBSSxjQUFjLEtBQUssR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDbkQsZUFBYyxJQUFJLGNBQWMsS0FBSyxDQUFDLENBQUMsRUFBRTtpQkFDekIsR0FBRyxHQUFHLEVBQUU7aUJBQ1IsaUJBQWlCLEdBQUcsQ0FBQztBQUNyQyxnQkFBZSxNQUFNO2lCQUNMLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUM7QUFDbEQsaUJBQWdCLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDO0FBQ3pFO2VBQ2MsU0FBUyxHQUFHLENBQUM7ZUFDYixJQUFJLEdBQUcsQ0FBQztlQUNSO0FBQ2Q7QUFDQSxZQUFXLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTthQUMvQyxHQUFHLEdBQUcsRUFBRTthQUNSLGlCQUFpQixHQUFHLENBQUM7YUFDckIsU0FBUyxHQUFHLENBQUM7YUFDYixJQUFJLEdBQUcsQ0FBQzthQUNSO0FBQ1o7QUFDQTtTQUNRLElBQUksY0FBYyxFQUFFO0FBQzVCLFdBQVUsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUM7YUFDaEIsR0FBRyxJQUFJLEtBQUs7QUFDeEI7YUFDWSxHQUFHLEdBQUcsSUFBSTtXQUNaLGlCQUFpQixHQUFHLENBQUM7QUFDL0I7QUFDQSxRQUFPLE1BQU07QUFDYixTQUFRLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDO0FBQzFCLFdBQVUsR0FBRyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25EO1dBQ1UsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsU0FBUSxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsU0FBUyxHQUFHLENBQUM7QUFDN0M7T0FDTSxTQUFTLEdBQUcsQ0FBQztPQUNiLElBQUksR0FBRyxDQUFDO01BQ1QsTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLFVBQVUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ2pELE9BQU0sRUFBRSxJQUFJO0FBQ1osTUFBSyxNQUFNO09BQ0wsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNmO0FBQ0E7QUFDQSxHQUFFLE9BQU8sR0FBRztBQUNaOztBQUVBLENBQUEsU0FBUyxPQUFPLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRTtHQUNoQyxJQUFJLEdBQUcsR0FBRyxVQUFVLENBQUMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJO0FBQzdDLEdBQUUsSUFBSSxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLElBQUksRUFBRSxLQUFLLFVBQVUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDO0dBQzlFLElBQUksQ0FBQyxHQUFHLEVBQUU7QUFDWixLQUFJLE9BQU8sSUFBSTtBQUNmO0FBQ0EsR0FBRSxJQUFJLEdBQUcsS0FBSyxVQUFVLENBQUMsSUFBSSxFQUFFO0tBQzNCLE9BQU8sR0FBRyxHQUFHLElBQUk7QUFDckI7QUFDQSxHQUFFLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQ3pCOztBQUVBLENBQUEsSUFBSSxLQUFLLEdBQUc7QUFDWjtBQUNBLEdBQUUsT0FBTyxFQUFFLFNBQVMsT0FBTyxHQUFHO0tBQzFCLElBQUksWUFBWSxHQUFHLEVBQUU7S0FDckIsSUFBSSxnQkFBZ0IsR0FBRyxLQUFLO0FBQ2hDLEtBQUksSUFBSSxHQUFHOztLQUVQLEtBQUssSUFBSSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDMUUsT0FBTSxJQUFJLElBQUk7T0FDUixJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ2hCLFNBQVEsSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDaEI7U0FDSCxJQUFJLEdBQUcsS0FBSyxTQUFTO0FBQzdCLFdBQVUsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUU7U0FDckIsSUFBSSxHQUFHLEdBQUc7QUFDbEI7O09BRU0sVUFBVSxDQUFDLElBQUksQ0FBQzs7QUFFdEI7QUFDQSxPQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7U0FDckI7QUFDUjs7QUFFQSxPQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLFlBQVk7T0FDeEMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO0FBQ2xEOztBQUVBO0FBQ0E7O0FBRUE7S0FDSSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsWUFBWSxFQUFFLENBQUMsZ0JBQWdCLENBQUM7O0tBRXBFLElBQUksZ0JBQWdCLEVBQUU7QUFDMUIsT0FBTSxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQztTQUN6QixPQUFPLEdBQUcsR0FBRyxZQUFZO0FBQ2pDO0FBQ0EsU0FBUSxPQUFPLEdBQUc7QUFDbEIsTUFBSyxNQUFNLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDeEMsT0FBTSxPQUFPLFlBQVk7QUFDekIsTUFBSyxNQUFNO0FBQ1gsT0FBTSxPQUFPLEdBQUc7QUFDaEI7SUFDRzs7QUFFSCxHQUFFLFNBQVMsRUFBRSxTQUFTLFNBQVMsQ0FBQyxJQUFJLEVBQUU7S0FDbEMsVUFBVSxDQUFDLElBQUksQ0FBQzs7S0FFaEIsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxPQUFPLEdBQUc7O0tBRWpDLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRTtBQUM5QyxLQUFJLElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUU7O0FBRW5FO0tBQ0ksSUFBSSxHQUFHLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQzs7QUFFbEQsS0FBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksR0FBRyxHQUFHO0tBQ2hELElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksaUJBQWlCLEVBQUUsSUFBSSxJQUFJLEdBQUc7O0FBRXpELEtBQUksSUFBSSxVQUFVLEVBQUUsT0FBTyxHQUFHLEdBQUcsSUFBSTtBQUNyQyxLQUFJLE9BQU8sSUFBSTtJQUNaOztBQUVILEdBQUUsVUFBVSxFQUFFLFNBQVMsVUFBVSxDQUFDLElBQUksRUFBRTtLQUNwQyxVQUFVLENBQUMsSUFBSSxDQUFDO0FBQ3BCLEtBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUU7SUFDcEQ7O0FBRUgsR0FBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLEdBQUc7QUFDeEIsS0FBSSxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQztBQUM5QixPQUFNLE9BQU8sR0FBRztBQUNoQixLQUFJLElBQUksTUFBTTtBQUNkLEtBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDL0MsT0FBTSxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO09BQ3RCLFVBQVUsQ0FBQyxHQUFHLENBQUM7QUFDckIsT0FBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1NBQ2xCLElBQUksTUFBTSxLQUFLLFNBQVM7V0FDdEIsTUFBTSxHQUFHLEdBQUc7QUFDdEI7QUFDQSxXQUFVLE1BQU0sSUFBSSxHQUFHLEdBQUcsR0FBRztBQUM3QjtBQUNBO0tBQ0ksSUFBSSxNQUFNLEtBQUssU0FBUztBQUM1QixPQUFNLE9BQU8sR0FBRztBQUNoQixLQUFJLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7SUFDL0I7O0dBRUQsUUFBUSxFQUFFLFNBQVMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUU7S0FDcEMsVUFBVSxDQUFDLElBQUksQ0FBQztLQUNoQixVQUFVLENBQUMsRUFBRSxDQUFDOztBQUVsQixLQUFJLElBQUksSUFBSSxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUU7O0FBRTlCLEtBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQzlCLEtBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDOztBQUUxQixLQUFJLElBQUksSUFBSSxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUU7O0FBRTlCO0tBQ0ksSUFBSSxTQUFTLEdBQUcsQ0FBQztLQUNqQixPQUFPLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFO09BQzNDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFO1NBQ25DO0FBQ1I7QUFDQSxLQUFJLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNO0FBQzdCLEtBQUksSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHLFNBQVM7O0FBRXJDO0tBQ0ksSUFBSSxPQUFPLEdBQUcsQ0FBQztLQUNmLE9BQU8sT0FBTyxHQUFHLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUU7T0FDckMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7U0FDL0I7QUFDUjtBQUNBLEtBQUksSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDLE1BQU07QUFDekIsS0FBSSxJQUFJLEtBQUssR0FBRyxLQUFLLEdBQUcsT0FBTzs7QUFFL0I7S0FDSSxJQUFJLE1BQU0sR0FBRyxPQUFPLEdBQUcsS0FBSyxHQUFHLE9BQU8sR0FBRyxLQUFLO0FBQ2xELEtBQUksSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0tBQ3RCLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDYixLQUFJLE9BQU8sQ0FBQyxJQUFJLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRTtBQUM3QixPQUFNLElBQUksQ0FBQyxLQUFLLE1BQU0sRUFBRTtBQUN4QixTQUFRLElBQUksS0FBSyxHQUFHLE1BQU0sRUFBRTtXQUNsQixJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUTtBQUN2RDtBQUNBO2FBQ1ksT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzVDLFlBQVcsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7QUFDOUI7QUFDQTthQUNZLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQ3hDO0FBQ0EsVUFBUyxNQUFNLElBQUksT0FBTyxHQUFHLE1BQU0sRUFBRTtXQUMzQixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUTtBQUMzRDtBQUNBO2FBQ1ksYUFBYSxHQUFHLENBQUM7QUFDN0IsWUFBVyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUM5QjtBQUNBO2FBQ1ksYUFBYSxHQUFHLENBQUM7QUFDN0I7QUFDQTtTQUNRO0FBQ1I7T0FDTSxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7T0FDN0MsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO09BQ3ZDLElBQUksUUFBUSxLQUFLLE1BQU07U0FDckI7WUFDRyxJQUFJLFFBQVEsS0FBSyxFQUFFO1NBQ3RCLGFBQWEsR0FBRyxDQUFDO0FBQ3pCOztLQUVJLElBQUksR0FBRyxHQUFHLEVBQUU7QUFDaEI7QUFDQTtBQUNBLEtBQUksS0FBSyxDQUFDLEdBQUcsU0FBUyxHQUFHLGFBQWEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRTtBQUMvRCxPQUFNLElBQUksQ0FBQyxLQUFLLE9BQU8sSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUTtBQUM1RCxTQUFRLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDO1dBQ2xCLEdBQUcsSUFBSSxJQUFJO0FBQ3JCO1dBQ1UsR0FBRyxJQUFJLEtBQUs7QUFDdEI7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsS0FBSSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQztPQUNoQixPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxhQUFhLENBQUM7VUFDM0M7T0FDSCxPQUFPLElBQUksYUFBYTtPQUN4QixJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRTtBQUN2QyxTQUFRLEVBQUUsT0FBTztBQUNqQixPQUFNLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUM7QUFDOUI7SUFDRzs7QUFFSCxHQUFFLFNBQVMsRUFBRSxTQUFTLFNBQVMsQ0FBQyxJQUFJLEVBQUU7QUFDdEMsS0FBSSxPQUFPLElBQUk7SUFDWjs7QUFFSCxHQUFFLE9BQU8sRUFBRSxTQUFTLE9BQU8sQ0FBQyxJQUFJLEVBQUU7S0FDOUIsVUFBVSxDQUFDLElBQUksQ0FBQztLQUNoQixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU8sR0FBRztLQUNqQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUNqQyxLQUFJLElBQUksT0FBTyxHQUFHLElBQUksS0FBSyxFQUFFO0FBQzdCLEtBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ1osSUFBSSxZQUFZLEdBQUcsSUFBSTtBQUMzQixLQUFJLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtBQUMvQyxPQUFNLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUMvQixPQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsUUFBUTtXQUNuQixJQUFJLENBQUMsWUFBWSxFQUFFO2FBQ2pCLEdBQUcsR0FBRyxDQUFDO2FBQ1A7QUFDWjtBQUNBLFVBQVMsTUFBTTtBQUNmO1NBQ1EsWUFBWSxHQUFHLEtBQUs7QUFDNUI7QUFDQTs7S0FFSSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRztLQUMxQyxJQUFJLE9BQU8sSUFBSSxHQUFHLEtBQUssQ0FBQyxFQUFFLE9BQU8sSUFBSTtLQUNyQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUMxQjs7R0FFRCxRQUFRLEVBQUUsU0FBUyxRQUFRLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtBQUN6QyxLQUFJLElBQUksR0FBRyxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsTUFBTSxJQUFJLFNBQVMsQ0FBQyxpQ0FBaUMsQ0FBQztLQUN4RyxVQUFVLENBQUMsSUFBSSxDQUFDOztLQUVoQixJQUFJLEtBQUssR0FBRyxDQUFDO0FBQ2pCLEtBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ1osSUFBSSxZQUFZLEdBQUcsSUFBSTtBQUMzQixLQUFJLElBQUksQ0FBQzs7QUFFVCxLQUFJLElBQUksR0FBRyxLQUFLLFNBQVMsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDMUUsT0FBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLE1BQU0sSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFLE9BQU8sRUFBRTtBQUMvRCxPQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQztBQUNqQyxPQUFNLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0FBQy9CLE9BQU0sS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtTQUNyQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUNyQyxTQUFRLElBQUksSUFBSSxLQUFLLEVBQUUsUUFBUTtBQUMvQjtBQUNBO2FBQ1ksSUFBSSxDQUFDLFlBQVksRUFBRTtBQUMvQixlQUFjLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztlQUNiO0FBQ2Q7QUFDQSxZQUFXLE1BQU07QUFDakIsV0FBVSxJQUFJLGdCQUFnQixLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ3ZDO0FBQ0E7YUFDWSxZQUFZLEdBQUcsS0FBSztBQUNoQyxhQUFZLGdCQUFnQixHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ3BDO0FBQ0EsV0FBVSxJQUFJLE1BQU0sSUFBSSxDQUFDLEVBQUU7QUFDM0I7YUFDWSxJQUFJLElBQUksS0FBSyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO0FBQ2pELGVBQWMsSUFBSSxFQUFFLE1BQU0sS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNuQztBQUNBO2lCQUNnQixHQUFHLEdBQUcsQ0FBQztBQUN2QjtBQUNBLGNBQWEsTUFBTTtBQUNuQjtBQUNBO2VBQ2MsTUFBTSxHQUFHLENBQUMsQ0FBQztlQUNYLEdBQUcsR0FBRyxnQkFBZ0I7QUFDcEM7QUFDQTtBQUNBO0FBQ0E7O09BRU0sSUFBSSxLQUFLLEtBQUssR0FBRyxFQUFFLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTTtPQUNoRixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQztBQUNuQyxNQUFLLE1BQU07QUFDWCxPQUFNLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7U0FDckMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUTtBQUM3QztBQUNBO2FBQ1ksSUFBSSxDQUFDLFlBQVksRUFBRTtBQUMvQixlQUFjLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztlQUNiO0FBQ2Q7QUFDQSxZQUFXLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDakM7QUFDQTtXQUNVLFlBQVksR0FBRyxLQUFLO0FBQzlCLFdBQVUsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ3JCO0FBQ0E7O0FBRUEsT0FBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUU7T0FDekIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUM7QUFDbkM7SUFDRzs7QUFFSCxHQUFFLE9BQU8sRUFBRSxTQUFTLE9BQU8sQ0FBQyxJQUFJLEVBQUU7S0FDOUIsVUFBVSxDQUFDLElBQUksQ0FBQztBQUNwQixLQUFJLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztLQUNqQixJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3JCLEtBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ1osSUFBSSxZQUFZLEdBQUcsSUFBSTtBQUMzQjtBQUNBO0tBQ0ksSUFBSSxXQUFXLEdBQUcsQ0FBQztBQUN2QixLQUFJLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtPQUN6QyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUNuQyxPQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsUUFBUTtBQUM3QjtBQUNBO1dBQ1UsSUFBSSxDQUFDLFlBQVksRUFBRTtBQUM3QixhQUFZLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQzthQUNqQjtBQUNaO1dBQ1U7QUFDVjtBQUNBLE9BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDdEI7QUFDQTtTQUNRLFlBQVksR0FBRyxLQUFLO0FBQzVCLFNBQVEsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ25CO0FBQ0EsT0FBTSxJQUFJLElBQUksS0FBSyxFQUFFLFFBQVE7QUFDN0I7QUFDQSxXQUFVLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQzthQUNqQixRQUFRLEdBQUcsQ0FBQztnQkFDVCxJQUFJLFdBQVcsS0FBSyxDQUFDO2FBQ3hCLFdBQVcsR0FBRyxDQUFDO0FBQzNCLFFBQU8sTUFBTSxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNsQztBQUNBO1NBQ1EsV0FBVyxHQUFHLENBQUMsQ0FBQztBQUN4QjtBQUNBOztLQUVJLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDckM7U0FDUSxXQUFXLEtBQUssQ0FBQztBQUN6QjtBQUNBLFNBQVEsV0FBVyxLQUFLLENBQUMsSUFBSSxRQUFRLEtBQUssR0FBRyxHQUFHLENBQUMsSUFBSSxRQUFRLEtBQUssU0FBUyxHQUFHLENBQUMsRUFBRTtBQUNqRixPQUFNLE9BQU8sRUFBRTtBQUNmO0tBQ0ksT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUM7SUFDakM7O0FBRUgsR0FBRSxNQUFNLEVBQUUsU0FBUyxNQUFNLENBQUMsVUFBVSxFQUFFO0tBQ2xDLElBQUksVUFBVSxLQUFLLElBQUksSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUU7T0FDekQsTUFBTSxJQUFJLFNBQVMsQ0FBQyxrRUFBa0UsR0FBRyxPQUFPLFVBQVUsQ0FBQztBQUNqSDtBQUNBLEtBQUksT0FBTyxPQUFPLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQztJQUNoQzs7QUFFSCxHQUFFLEtBQUssRUFBRSxTQUFTLEtBQUssQ0FBQyxJQUFJLEVBQUU7S0FDMUIsVUFBVSxDQUFDLElBQUksQ0FBQzs7S0FFaEIsSUFBSSxHQUFHLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7S0FDNUQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxPQUFPLEdBQUc7S0FDakMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDakMsS0FBSSxJQUFJLFVBQVUsR0FBRyxJQUFJLEtBQUssRUFBRTtBQUNoQyxLQUFJLElBQUksS0FBSztLQUNULElBQUksVUFBVSxFQUFFO0FBQ3BCLE9BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHO09BQ2QsS0FBSyxHQUFHLENBQUM7QUFDZixNQUFLLE1BQU07T0FDTCxLQUFLLEdBQUcsQ0FBQztBQUNmO0FBQ0EsS0FBSSxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7S0FDakIsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUNyQixLQUFJLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztLQUNaLElBQUksWUFBWSxHQUFHLElBQUk7QUFDM0IsS0FBSSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUM7O0FBRTNCO0FBQ0E7S0FDSSxJQUFJLFdBQVcsR0FBRyxDQUFDOztBQUV2QjtBQUNBLEtBQUksT0FBTyxDQUFDLElBQUksS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQzVCLE9BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQy9CLE9BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO0FBQzdCO0FBQ0E7V0FDVSxJQUFJLENBQUMsWUFBWSxFQUFFO0FBQzdCLGFBQVksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDO2FBQ2pCO0FBQ1o7V0FDVTtBQUNWO0FBQ0EsT0FBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUN0QjtBQUNBO1NBQ1EsWUFBWSxHQUFHLEtBQUs7QUFDNUIsU0FBUSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDbkI7QUFDQSxPQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsUUFBUTtBQUM3QjtBQUNBLFdBQVUsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksV0FBVyxLQUFLLENBQUMsRUFBRSxXQUFXLEdBQUcsQ0FBQztBQUN2RixVQUFTLE1BQU0sSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDcEM7QUFDQTtTQUNRLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFDeEI7QUFDQTs7S0FFSSxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQ3JDO0tBQ0ksV0FBVyxLQUFLLENBQUM7QUFDckI7QUFDQSxLQUFJLFdBQVcsS0FBSyxDQUFDLElBQUksUUFBUSxLQUFLLEdBQUcsR0FBRyxDQUFDLElBQUksUUFBUSxLQUFLLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDN0UsT0FBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUN0QixTQUFRLElBQUksU0FBUyxLQUFLLENBQUMsSUFBSSxVQUFVLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQztBQUN6STtBQUNBLE1BQUssTUFBTTtBQUNYLE9BQU0sSUFBSSxTQUFTLEtBQUssQ0FBQyxJQUFJLFVBQVUsRUFBRTtTQUNqQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQztTQUNsQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztBQUNyQyxRQUFPLE1BQU07U0FDTCxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQztTQUMxQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQztBQUM3QztPQUNNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDO0FBQ3pDOztBQUVBLEtBQUksSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxVQUFVLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHOztBQUVoRyxLQUFJLE9BQU8sR0FBRztJQUNYOztHQUVELEdBQUcsRUFBRSxHQUFHO0dBQ1IsU0FBUyxFQUFFLEdBQUc7R0FDZCxLQUFLLEVBQUUsSUFBSTtBQUNiLEdBQUUsS0FBSyxFQUFFO0VBQ1I7O0NBRUQsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLOztBQUVuQixDQUFBLGNBQWMsR0FBRyxLQUFLOzs7Ozs7QUN6Z0J0QixNQUFNLGNBQWMsR0FBRztJQUNyQixNQUFNO0lBQ04sTUFBTTtJQUNOLE9BQU87SUFDUCxNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixPQUFPO0lBQ1AsT0FBTztJQUNQLE9BQU87Q0FDUjtBQUVLLFNBQVUsU0FBUyxDQUFDLEdBQVcsRUFBQTtJQUNuQyxPQUFPLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ25EO0FBQ00sU0FBVSxrQkFBa0IsQ0FBQyxJQUFZLEVBQUE7QUFDN0MsSUFBQSxPQUFPLFNBQVMsQ0FBQ0EsNkJBQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQztBQUVPLGVBQWUsY0FBYyxDQUFDLE1BQWdCLEVBQUE7SUFDbkQsTUFBTSxNQUFNLEdBQUcsRUFBRTtBQUVqQixJQUFBLFdBQVcsTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFO1FBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzs7O0lBSWpDLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO0FBQ2hEO0FBRU0sU0FBVSxXQUFXLENBQUMsR0FBVyxFQUFBO0FBQ3JDLElBQUEsT0FBTyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FDckUsR0FBRyxDQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ047QUFFTSxTQUFVLFlBQVksQ0FBQyxJQUFjLEVBQUE7QUFDekMsSUFBQSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFO0FBQ25DLElBQUEsSUFBSSxTQUFTO0FBQ2IsSUFBQSxZQUFZLENBQUMsT0FBTyxDQUFDLElBQUksSUFBRztRQUMxQixJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ25DLFNBQVMsR0FBRyxJQUFJO0FBQ2hCLFlBQUEsT0FBTyxJQUFJOztBQUVmLEtBQUMsQ0FBQztBQUNGLElBQUEsT0FBTyxTQUFTO0FBQ2xCO0FBTWdCLFNBQUEsYUFBYSxDQUMzQixHQUFRLEVBQ1IsR0FBVyxFQUFBO0lBRVgsTUFBTSxHQUFHLEdBQXlCLEVBQUU7QUFDcEMsSUFBQSxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBRztRQUNwQixHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsT0FBTztBQUM3QixLQUFDLENBQUM7QUFDRixJQUFBLE9BQU8sR0FBRztBQUNaO0FBRU0sU0FBVSxtQkFBbUIsQ0FBQyxNQUFjLEVBQUE7SUFDaEQsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUNsRCxJQUFBLE1BQU0sSUFBSSxHQUFHLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQztBQUN4QyxJQUFBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3RDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDOztBQUVyQixJQUFBLE9BQU8sV0FBVztBQUNwQjtTQVdnQixJQUFJLEdBQUE7QUFDbEIsSUFBQSxPQUFPLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUM1Qzs7QUN4RkE7QUFDQSxTQUFTLEVBQUUsQ0FBQyxLQUFLLEVBQUU7QUFDbkIsSUFBSSxPQUFPLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLFVBQVUsQ0FBQztBQUN2RDtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU0sS0FBSyxHQUFHO0FBQ3JCLElBQUksR0FBRyxFQUFFLENBQUM7QUFDVixJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3ZCLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUN6QyxLQUFLO0FBQ0wsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDOUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUM7QUFDekMsUUFBUSxPQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ3pCO0FBQ0EsQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNPLE1BQU0sU0FBUyxHQUFHO0FBQ3pCLElBQUksR0FBRyxFQUFFLENBQUM7QUFDVixJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3ZCLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUM7QUFDaEQsS0FBSztBQUNMLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQzlCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQztBQUNoRCxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxTQUFTLEdBQUc7QUFDekIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQzFDLEtBQUs7QUFDTCxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtBQUM5QixRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztBQUMxQyxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBaUNEO0FBQ0E7QUFDQTtBQUNPLE1BQU0sU0FBUyxHQUFHO0FBQ3pCLElBQUksR0FBRyxFQUFFLENBQUM7QUFDVixJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3ZCLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUM7QUFDaEQsS0FBSztBQUNMLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQzlCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQztBQUNoRCxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxTQUFTLEdBQUc7QUFDekIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQzFDLEtBQUs7QUFDTCxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtBQUM5QixRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztBQUMxQyxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBd0VEO0FBQ0E7QUFDQTtBQUNPLE1BQU0sUUFBUSxHQUFHO0FBQ3hCLElBQUksR0FBRyxFQUFFLENBQUM7QUFDVixJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3ZCLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUN6QyxLQUFLO0FBQ0wsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDOUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUM7QUFDekMsUUFBUSxPQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ3pCO0FBQ0EsQ0FBQztBQWNEO0FBQ0E7QUFDQTtBQUNPLE1BQU0sU0FBUyxHQUFHO0FBQ3pCLElBQUksR0FBRyxFQUFFLENBQUM7QUFDVixJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3ZCLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUM7QUFDbkQsS0FBSztBQUNMLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQzlCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQztBQUNuRCxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBK0tEO0FBQ0E7QUFDQTtBQUNPLE1BQU0sVUFBVSxDQUFDO0FBQ3hCLElBQUksV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUU7QUFDL0IsUUFBUSxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUc7QUFDdEIsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVE7QUFDaEM7QUFDQSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFO0FBQzVCLFFBQVEsT0FBT0Msa0JBQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO0FBQ3pGO0FBQ0E7O0FDOVlPLE1BQU0sZUFBZSxHQUFHLGVBQWU7QUFDOUM7QUFDQTtBQUNBO0FBQ08sTUFBTSxnQkFBZ0IsU0FBUyxLQUFLLENBQUM7QUFDNUMsSUFBSSxXQUFXLEdBQUc7QUFDbEIsUUFBUSxLQUFLLENBQUMsZUFBZSxDQUFDO0FBQzlCO0FBQ0E7O0FDUk8sTUFBTSxRQUFRLENBQUM7QUFDdEIsSUFBSSxXQUFXLEdBQUc7QUFDbEIsUUFBUSxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sSUFBSTtBQUNqQyxRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxJQUFJO0FBQ2hDLFFBQVEsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEtBQUs7QUFDeEQsWUFBWSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU07QUFDaEMsWUFBWSxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU87QUFDbEMsU0FBUyxDQUFDO0FBQ1Y7QUFDQTs7QUNSTyxNQUFNLG9CQUFvQixDQUFDO0FBQ2xDLElBQUksV0FBVyxHQUFHO0FBQ2xCO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSTtBQUNoRCxRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSztBQUNoQztBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFO0FBQzNCO0FBQ0EsSUFBSSxNQUFNLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtBQUMzQyxRQUFRLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztBQUNyRSxRQUFRLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzdFLFFBQVEsT0FBTyxTQUFTO0FBQ3hCO0FBQ0EsSUFBSSxNQUFNLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtBQUN2QyxRQUFRLElBQUksTUFBTSxLQUFLLENBQUMsRUFBRTtBQUMxQixZQUFZLE9BQU8sQ0FBQztBQUNwQjtBQUNBLFFBQVEsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO0FBQ3ZFLFFBQVEsU0FBUyxJQUFJLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsU0FBUyxFQUFFLE1BQU0sR0FBRyxTQUFTLENBQUM7QUFDdkcsUUFBUSxJQUFJLFNBQVMsS0FBSyxDQUFDLEVBQUU7QUFDN0IsWUFBWSxNQUFNLElBQUksZ0JBQWdCLEVBQUU7QUFDeEM7QUFDQSxRQUFRLE9BQU8sU0FBUztBQUN4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtBQUMvQyxRQUFRLElBQUksU0FBUyxHQUFHLE1BQU07QUFDOUIsUUFBUSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3pCO0FBQ0EsUUFBUSxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFO0FBQzNELFlBQVksTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUNsRCxZQUFZLElBQUksQ0FBQyxRQUFRO0FBQ3pCLGdCQUFnQixNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDO0FBQzdELFlBQVksTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQztBQUNoRSxZQUFZLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLEVBQUUsTUFBTSxHQUFHLFNBQVMsQ0FBQztBQUN6RSxZQUFZLFNBQVMsSUFBSSxPQUFPO0FBQ2hDLFlBQVksU0FBUyxJQUFJLE9BQU87QUFDaEMsWUFBWSxJQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFO0FBQzNDO0FBQ0EsZ0JBQWdCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0Q7QUFDQTtBQUNBLFFBQVEsT0FBTyxTQUFTO0FBQ3hCO0FBQ0EsSUFBSSxNQUFNLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUU7QUFDcEUsUUFBUSxJQUFJLFNBQVMsR0FBRyxnQkFBZ0I7QUFDeEMsUUFBUSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3pCO0FBQ0EsUUFBUSxPQUFPLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQ25ELFlBQVksTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDO0FBQ3RFLFlBQVksTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsU0FBUyxFQUFFLE1BQU0sQ0FBQztBQUMxRixZQUFZLElBQUksUUFBUSxLQUFLLENBQUM7QUFDOUIsZ0JBQWdCO0FBQ2hCLFlBQVksU0FBUyxJQUFJLFFBQVE7QUFDakMsWUFBWSxTQUFTLElBQUksUUFBUTtBQUNqQztBQUNBLFFBQVEsT0FBTyxTQUFTO0FBQ3hCO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTSxZQUFZLFNBQVMsb0JBQW9CLENBQUM7QUFDdkQsSUFBSSxXQUFXLENBQUMsQ0FBQyxFQUFFO0FBQ25CLFFBQVEsS0FBSyxFQUFFO0FBQ2YsUUFBUSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDbEI7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUk7QUFDNUIsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7QUFDaEMsWUFBWSxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDO0FBQ3RFO0FBQ0EsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0FBQ3JFLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3JELFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQzNFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sY0FBYyxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO0FBQ2pELFFBQVEsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQzlCLFlBQVksT0FBTyxDQUFDO0FBQ3BCO0FBQ0EsUUFBUSxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7QUFDOUMsUUFBUSxJQUFJLFVBQVUsRUFBRTtBQUN4QixZQUFZLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQztBQUMxQyxZQUFZLE9BQU8sVUFBVSxDQUFDLE1BQU07QUFDcEM7QUFDQSxRQUFRLE1BQU0sT0FBTyxHQUFHO0FBQ3hCLFlBQVksTUFBTTtBQUNsQixZQUFZLE1BQU07QUFDbEIsWUFBWSxNQUFNO0FBQ2xCLFlBQVksUUFBUSxFQUFFLElBQUksUUFBUTtBQUNsQyxTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRO0FBQ3hDLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU07QUFDdEMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQztBQUN0QyxTQUFTLENBQUM7QUFDVixRQUFRLE9BQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPO0FBQ3ZDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUU7QUFDMUIsUUFBUSxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQ3RELFFBQVEsSUFBSSxVQUFVLEVBQUU7QUFDeEIsWUFBWSxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUMxRCxZQUFZLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7QUFDdkQsWUFBWSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUk7QUFDaEM7QUFDQSxhQUFhO0FBQ2IsWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTTtBQUMxQyxnQkFBZ0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUM7QUFDMUMsYUFBYSxDQUFDO0FBQ2Q7QUFDQTtBQUNBLElBQUksTUFBTSxDQUFDLEdBQUcsRUFBRTtBQUNoQixRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSTtBQUMvQixRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUMzQixZQUFZLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUNyQyxZQUFZLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSTtBQUNoQztBQUNBO0FBQ0EsSUFBSSxNQUFNLEtBQUssR0FBRztBQUNsQixRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFO0FBQ3hCO0FBQ0E7O0FDN0VBO0FBQ0E7QUFDQTtBQUNPLE1BQU0saUJBQWlCLENBQUM7QUFDL0IsSUFBSSxXQUFXLENBQUMsUUFBUSxFQUFFO0FBQzFCO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDO0FBQ3pCLFFBQVEsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDMUMsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsR0FBRyxRQUFRLEdBQUcsRUFBRTtBQUNoRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxTQUFTLENBQUMsS0FBSyxFQUFFLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ3JELFFBQVEsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztBQUNwRCxRQUFRLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUNuRSxRQUFRLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHO0FBQzNCLFlBQVksTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQ3hDLFFBQVEsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDdkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sU0FBUyxDQUFDLEtBQUssRUFBRSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUNyRCxRQUFRLE1BQU0sVUFBVSxHQUFHLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7QUFDcEQsUUFBUSxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFDbkUsUUFBUSxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRztBQUMzQixZQUFZLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFRLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxVQUFVLENBQUMsS0FBSyxFQUFFO0FBQzVCLFFBQVEsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQ2hGLFFBQVEsSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUc7QUFDM0IsWUFBWSxNQUFNLElBQUksZ0JBQWdCLEVBQUU7QUFDeEMsUUFBUSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFDM0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFVBQVUsQ0FBQyxLQUFLLEVBQUU7QUFDNUIsUUFBUSxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDaEYsUUFBUSxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRztBQUMzQixZQUFZLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFRLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztBQUMzQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sTUFBTSxDQUFDLE1BQU0sRUFBRTtBQUN6QixRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO0FBQzlDLFlBQVksTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVE7QUFDaEUsWUFBWSxJQUFJLE1BQU0sR0FBRyxTQUFTLEVBQUU7QUFDcEMsZ0JBQWdCLElBQUksQ0FBQyxRQUFRLElBQUksU0FBUztBQUMxQyxnQkFBZ0IsT0FBTyxTQUFTO0FBQ2hDO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxRQUFRLElBQUksTUFBTTtBQUMvQixRQUFRLE9BQU8sTUFBTTtBQUNyQjtBQUNBLElBQUksTUFBTSxLQUFLLEdBQUc7QUFDbEI7QUFDQTtBQUNBLElBQUksZ0JBQWdCLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUMxQyxRQUFRLElBQUksT0FBTyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUMzRixZQUFZLE1BQU0sSUFBSSxLQUFLLENBQUMsdUVBQXVFLENBQUM7QUFDcEc7QUFDQSxRQUFRLElBQUksT0FBTyxFQUFFO0FBQ3JCLFlBQVksT0FBTztBQUNuQixnQkFBZ0IsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUNyRCxnQkFBZ0IsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDO0FBQzNELGdCQUFnQixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxJQUFJLFVBQVUsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3JILGdCQUFnQixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUNyRSxhQUFhO0FBQ2I7QUFDQSxRQUFRLE9BQU87QUFDZixZQUFZLFNBQVMsRUFBRSxLQUFLO0FBQzVCLFlBQVksTUFBTSxFQUFFLENBQUM7QUFDckIsWUFBWSxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU07QUFDckMsWUFBWSxRQUFRLEVBQUUsSUFBSSxDQUFDO0FBQzNCLFNBQVM7QUFDVDtBQUNBOztBQ2pHQSxNQUFNLGFBQWEsR0FBRyxNQUFNO0FBQ3JCLE1BQU0sbUJBQW1CLFNBQVMsaUJBQWlCLENBQUM7QUFDM0QsSUFBSSxXQUFXLENBQUMsWUFBWSxFQUFFLFFBQVEsRUFBRTtBQUN4QyxRQUFRLEtBQUssQ0FBQyxRQUFRLENBQUM7QUFDdkIsUUFBUSxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVk7QUFDeEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxXQUFXLEdBQUc7QUFDeEIsUUFBUSxPQUFPLElBQUksQ0FBQyxRQUFRO0FBQzVCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFVBQVUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFO0FBQzFDLFFBQVEsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUM7QUFDdEUsUUFBUSxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRO0FBQzlELFFBQVEsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFO0FBQzNCLFlBQVksTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztBQUN4QyxZQUFZLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDO0FBQ3ZEO0FBQ0EsYUFBYSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDaEMsWUFBWSxNQUFNLElBQUksS0FBSyxDQUFDLHVFQUF1RSxDQUFDO0FBQ3BHO0FBQ0EsUUFBUSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQ3RDLFlBQVksT0FBTyxDQUFDO0FBQ3BCO0FBQ0EsUUFBUSxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUM7QUFDMUcsUUFBUSxJQUFJLENBQUMsUUFBUSxJQUFJLFNBQVM7QUFDbEMsUUFBUSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxLQUFLLFNBQVMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFO0FBQ2hGLFlBQVksTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQ3hDO0FBQ0EsUUFBUSxPQUFPLFNBQVM7QUFDeEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sVUFBVSxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUU7QUFDMUMsUUFBUSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQztBQUN0RSxRQUFRLElBQUksU0FBUyxHQUFHLENBQUM7QUFDekIsUUFBUSxJQUFJLFdBQVcsQ0FBQyxRQUFRLEVBQUU7QUFDbEMsWUFBWSxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRO0FBQ2xFLFlBQVksSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFO0FBQy9CLGdCQUFnQixNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztBQUNqRixnQkFBZ0IsU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDO0FBQ25HLGdCQUFnQixVQUFVLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUNsRixnQkFBZ0IsT0FBTyxTQUFTLEdBQUcsU0FBUztBQUM1QztBQUNBLGlCQUFpQixJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDcEMsZ0JBQWdCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0RBQWdELENBQUM7QUFDakY7QUFDQTtBQUNBLFFBQVEsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUNwQyxZQUFZLElBQUk7QUFDaEIsZ0JBQWdCLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUM7QUFDNUc7QUFDQSxZQUFZLE9BQU8sR0FBRyxFQUFFO0FBQ3hCLGdCQUFnQixJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsU0FBUyxJQUFJLEdBQUcsWUFBWSxnQkFBZ0IsRUFBRTtBQUNyRixvQkFBb0IsT0FBTyxDQUFDO0FBQzVCO0FBQ0EsZ0JBQWdCLE1BQU0sR0FBRztBQUN6QjtBQUNBLFlBQVksSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsS0FBSyxTQUFTLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRTtBQUM1RSxnQkFBZ0IsTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQzVDO0FBQ0E7QUFDQSxRQUFRLE9BQU8sU0FBUztBQUN4QjtBQUNBLElBQUksTUFBTSxNQUFNLENBQUMsTUFBTSxFQUFFO0FBQ3pCO0FBQ0EsUUFBUSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUM7QUFDdkQsUUFBUSxNQUFNLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUM7QUFDM0MsUUFBUSxJQUFJLFlBQVksR0FBRyxDQUFDO0FBQzVCLFFBQVEsT0FBTyxZQUFZLEdBQUcsTUFBTSxFQUFFO0FBQ3RDLFlBQVksTUFBTSxTQUFTLEdBQUcsTUFBTSxHQUFHLFlBQVk7QUFDbkQsWUFBWSxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFDbEcsWUFBWSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDL0IsZ0JBQWdCLE9BQU8sU0FBUztBQUNoQztBQUNBLFlBQVksWUFBWSxJQUFJLFNBQVM7QUFDckM7QUFDQSxRQUFRLE9BQU8sWUFBWTtBQUMzQjtBQUNBOztBQzNGTyxNQUFNLGVBQWUsU0FBUyxpQkFBaUIsQ0FBQztBQUN2RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxXQUFXLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRTtBQUN0QyxRQUFRLEtBQUssQ0FBQyxRQUFRLENBQUM7QUFDdkIsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVU7QUFDcEMsUUFBUSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxVQUFVLENBQUMsTUFBTTtBQUN4RjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxVQUFVLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUMxQyxRQUFRLElBQUksT0FBTyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUU7QUFDekMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUNsRCxnQkFBZ0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx1RUFBdUUsQ0FBQztBQUN4RztBQUNBLFlBQVksSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUTtBQUM1QztBQUNBLFFBQVEsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUM7QUFDcEUsUUFBUSxJQUFJLENBQUMsUUFBUSxJQUFJLFNBQVM7QUFDbEMsUUFBUSxPQUFPLFNBQVM7QUFDeEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sVUFBVSxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUU7QUFDMUMsUUFBUSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQztBQUN0RSxRQUFRLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDO0FBQ3RHLFFBQVEsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsS0FBSyxVQUFVLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRTtBQUN6RSxZQUFZLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRTtBQUN4QztBQUNBLGFBQWE7QUFDYixZQUFZLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUM7QUFDakksWUFBWSxPQUFPLFVBQVU7QUFDN0I7QUFDQTtBQUNBLElBQUksTUFBTSxLQUFLLEdBQUc7QUFDbEI7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVMsVUFBVSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUU7QUFDN0MsSUFBSSxRQUFRLEdBQUcsUUFBUSxHQUFHLFFBQVEsR0FBRyxFQUFFO0FBQ3ZDLElBQUksT0FBTyxJQUFJLG1CQUFtQixDQUFDLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUN0RTtBQVlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVMsVUFBVSxDQUFDLFVBQVUsRUFBRSxRQUFRLEVBQUU7QUFDakQsSUFBSSxPQUFPLElBQUksZUFBZSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUM7QUFDcEQ7O0FDbENPLFNBQVMsYUFBYSxDQUFDLE1BQU0sRUFBRTtBQUN0QyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlEOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDTyxTQUFTLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzdELENBQUMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNuRyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRTtBQUM1QixFQUFFLE9BQU8sS0FBSztBQUNkOztBQUVBLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQzs7QUFFcEIsQ0FBQyxLQUFLLElBQUksS0FBSyxHQUFHLE1BQU0sRUFBRSxLQUFLLEdBQUcsTUFBTSxHQUFHLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRTtBQUN6RCxFQUFFLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ3RCOztBQUVBLENBQUMsS0FBSyxJQUFJLEtBQUssR0FBRyxNQUFNLEdBQUcsR0FBRyxFQUFFLEtBQUssR0FBRyxNQUFNLEdBQUcsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFO0FBQy9ELEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDdEI7O0FBRUEsQ0FBQyxPQUFPLE9BQU8sS0FBSyxHQUFHO0FBQ3ZCOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTSxtQkFBbUIsR0FBRztBQUNuQyxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUM3SSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQ1AsQ0FBQzs7QUNyQ00sTUFBTSxVQUFVLEdBQUc7QUFDMUIsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxPQUFPO0FBQ1IsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxPQUFPO0FBQ1IsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxRQUFRO0FBQ1QsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxHQUFHO0FBQ0osQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxPQUFPO0FBQ1IsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxPQUFPO0FBQ1IsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxPQUFPO0FBQ1IsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxJQUFJO0FBQ0wsQ0FBQyxLQUFLO0FBQ04sQ0FBQyxNQUFNO0FBQ1AsQ0FBQyxLQUFL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SUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDekMsUUFBQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNyQyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUNqQyxZQUFBLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUNaLElBQUksSUFBSSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO0FBQzlCLGdCQUFBLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUU7Z0JBQzVDLE1BQU0sQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQzFDOzs7O0FBSVA7Ozs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMiwzLDQsNSw2LDcsOCw5LDEwLDExLDEyLDEzLDE0XX0=
