import {geoPath, geoProjection} from "d3-geo";

var NUM_MAS = 4; // RGBA
var SPHERE = {type: "Sphere"};

function clamp(val, min, max) {
  if (min > max) {
    throw 'min > max'
  }
  return Math.max(min, Math.min(val, max));
}

function interpolate(band, point) {
  var x = point[0];
  var y = point[1];
  var col = clamp(Math.round(x), 0, band.size.x - 1);
  var row = clamp(Math.round(y), 0, band.size.y - 1);
  return band.pixels.get(col, row);
}

export default function() {
  var srcProj = null,
      dstProj = null,
      maskObject = null,
      chunkSize = [1000, 1000],
      createCanvas,
      maskCanvas,
      maskContext,
      src,
      dst;

  function makeMask(x0, y0, x1, y1) {
    var width = x1 - x0;
    var height = y1 - y0;

    // Temporarily translate the dstProjection
    var translate0 = dstProj.translate();
    dstProj.translate([translate0[0] - x0, translate0[1] - y0]);
    
    maskContext.clearRect(0, 0, width, height);
    maskContext.beginPath();
    geoPath().projection(dstProj).context(maskContext)(maskObject);
    maskContext.closePath();
    maskContext.fill();
    
    dstProj.translate(translate0);
    
    var m = maskContext.getImageData(0, 0, width, height).data;

    return function(x, y) {
      // To mask image coords
      x = x - x0;
      y = y - y0;

      // Get first component of mask pixel
      var linearCoords = (y * width + x) * NUM_MAS;
      return m[linearCoords] != 0;
    }
  }

  function warpChunk(x0, y0, x1, y1) {
    var isVisible = makeMask(x0, y0, x1, y1);
    var dstChunk, value;

    var dstPoints = [],
        srcPoints = [];

    for (var x = x0; x < x1; x++) {
      for (var y = y0; y < y1; y++) {
        if (isVisible(x, y)) {
          // Invert middle of pixel coordinate
          dstPoints.push([x + 0.5, y + 0.5]);
        }
      }
    }

    srcPoints = dstPoints.map(function(dstPoint) {
      return srcProj(dstProj.invert(dstPoint));
    });

    dst.bands.forEach(function(band, i) {
      dstChunk = band.pixels.read(x0, y0, x1 - x0, y1 - y0);
      dstPoints.map(function (v) { return v.map(Math.floor)}).forEach(function(dstPoint, j) {
        value = interpolate(src.bands.get(i), srcPoints[j]);
        dstChunk[dstPoint[1] * (x1 - x0) + dstPoint[0]] = value;
      });
      band.pixels.write(x0, y0, x1 - x0, y1 - y0, dstChunk);
    });
  }

  function warp(bbox) {

    maskCanvas = createCanvas(chunkSize[0], chunkSize[1]);
    maskContext = maskCanvas.getContext('2d');
    maskContext.fillStyle = '#fff';

    if (typeof(bbox) === 'undefined') {
      bbox = {
        x0: 0,
        x1: dst.rasterSize.x,
        y0: 0,
        y1: dst.rasterSize.y
      };
    }

    for (var x = bbox.x0; x < bbox.x1; x += chunkSize[0]) {
      for (var y = bbox.y0; y < bbox.y1; y += chunkSize[1]) {
        warpChunk(
          x,
          y,
          x + Math.min(bbox.x1, x + chunkSize[0]),
          y + Math.min(bbox.y1, y + chunkSize[1]));
      }
    }
  }

  warp.dstProj = function(_) {
    return arguments.length ? (dstProj = _, warp) : dstProj;
  };

  warp.srcProj = function(_) {
    return arguments.length ? (srcProj = _, warp) : srcProj;
  };

  warp.dst = function(_) {
    return arguments.length ? (dst = _, warp) : dst;
  };

  warp.src = function(_) {
    return arguments.length ? (src = _, warp) : src;
  };

  warp.chunkSize = function(_) {
    return arguments.length ? (chunkSize = _, warp) : chunkSize;
  };

  warp.maskObject = function(_) {
    return arguments.length ? (maskObject = _, warp) : maskObject;
  };

  warp.createCanvas = function(_) {
    return arguments.length ? (createCanvas = _, warp) : createCanvas;
  };

  return warp.maskObject(SPHERE);
}
