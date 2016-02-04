var WIDTH;
var HEIGHT;
var map;
var mapProjection;
var heatmap;
var heatmapData = new Array();
var heatmapRadius = 30;
var heatmapIsOn = false;
var canvasLayer;
var context;
var g;
var pxs = new Array();
var rint = 60;
var timeScale = 1 / 1000;
var canvas;
var ctx;
var clockRadius;
var tripStartTime;
var drawStartTime;
var livingParticles = {};

var resolutionScale = window.devicePixelRatio || 1;

$(document).ready(function(){

  $('#btn-canvas').on('click', function() {

    tripStartTime = moment(trip_data[0].start_date, 'MM-DD-YYYY HH:mm:ss'); 
    drawStartTime = moment();

    // initialize the canvasLayer
    var canvasLayerOptions = {
      map: map,
      resizeHandler: resize,
      animate: true,
      updateHandler: update,
      resolutionScale: resolutionScale
    };
    canvasLayer = new CanvasLayer(canvasLayerOptions);
    context = canvasLayer.canvas.getContext('2d');

    // Initiate the clock
    initClock();

    // Create the Particles
    for (var i = 0; i < trip_data.length; i++) {
      var elapsed = (moment(trip_data[i].start_date, 'MM-DD-YYYY HH:mm:ss') - tripStartTime) * timeScale;
      createOneParticle(i, elapsed);
    }
  })

  $('#btn-heatmap>input').on('click', function() {
    heatmapIsOn = !heatmapIsOn;
  })
});

function createOneParticle(i, elapsed) {
  setTimeout(function() {
    pxs[i] = new Circle(i);
    pxs[i].reset();
    livingParticles["p" + i] = pxs[i];
  }, elapsed);  
}

function init() {
  // initialize the map
  var mapOptions = {
    zoom: 13,
    center: new google.maps.LatLng(42.35, -71.08),
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    styles: [
      {
        stylers: [{saturation: -85}]
      }, {
        featureType: "water",
        elementType: "geometry",
        stylers: [
          { lightness: -20 }
        ]
      }
    ]
  };
  var mapDiv = document.getElementById('map-div');
  map = new google.maps.Map(mapDiv, mapOptions);
  // Json Layer
  map.data.loadGeoJson('js/station.json');
  map.data.setStyle(function(feature) {
    return {
      icon: {
        url: 'img/dot.png',
        anchor: new google.maps.Point(4, 4)
      }
    }
  });
  map.data.addListener('mouseover', function(event) {
    // highlightFeature(event);
    createTooltipforPoint(event);
  })
  map.data.addListener('mouseout', function(event) {
    resetFeature(event);
    map.data.revertStyle();
  })
  // Heatmap Layer
  heatmap = new google.maps.visualization.HeatmapLayer({
    map: map,
    radius: heatmapRadius
  });
}

function highlightFeature(d) {
  map.data.revertStyle();

  var icon = {
    url: 'img/marker-diamond.png',
    scaledSize: new google.maps.Size(32, 42)
  };
  map.data.overrideStyle(d.feature, {
    icon: icon,
    fillOpacity: 0.1,
    strokeWeight: 4,
    zIndex: 5,
    cursor: (getPointIsOn) ? 'crosshair' : 'pointer'
  });
}

function createTooltipforPoint(d) {
  $('#hover-tooltip').stop();
  $('#hover-tooltip').show();
  $(".dialog-title").html("<div class='tooltip-paragraph' align='left'><span class='thin-tooltip-label'>Station: </span><span class='highlight'>" + d.feature.getProperty('station') + "</span></div>" +
      "<div class='tooltip-paragraph' align='left'><span class='thin-tooltip-label'>Terminal: </span>" + d.feature.getProperty('terminal') + "</div>");
  
  try {
    var overlay = new google.maps.OverlayView();
    overlay.draw = function() {};
    overlay.setMap(map);

    var tooltipHeight = $(".dialog-title").height() + 23;
    var tooltipWidth = $(".dialog-title").width() - 10;
    var point = overlay.getProjection().fromLatLngToContainerPixel(d.latLng);
    $("#hover-tooltip").css('left',point.x - tooltipWidth/2)
      .css('top',point.y - tooltipHeight/2)
      .height(tooltipHeight);
    } catch (err) {}
  
}
function resetFeature(d) {
  $('#hover-tooltip').stop();
  $("#hover-tooltip").hide(100);
}

function resize() {
  // nothing to do here
}

function update() {
  // clear previous canvas contents
  var canvasWidth = canvasLayer.canvas.width;
  var canvasHeight = canvasLayer.canvas.height;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  
  /* We need to scale and translate the map for current view.
   * see https://developers.google.com/maps/documentation/javascript/maptypes#MapCoordinates
   */
  mapProjection = map.getProjection();

  /**
   * Clear transformation from last update by setting to identity matrix.
   * Could use context.resetTransform(), but most browsers don't support
   * it yet.
   */
  context.setTransform(1, 0, 0, 1, 0, 0);
  
  // scale is just 2^zoom
  // If canvasLayer is scaled (with resolutionScale), we need to scale by
  // the same amount to account for the larger canvas.
  var scale = Math.pow(2, map.zoom) * resolutionScale;
  context.scale(scale, scale);

  /* If the map was not translated, the topLeft corner would be 0,0 in
   * world coordinates. Our translation is just the vector from the
   * world coordinate of the topLeft corder to 0,0.
   */
  var offset = mapProjection.fromLatLngToPoint(canvasLayer.getTopLeft());
  context.translate(-offset.x, -offset.y);

  // Update generated particles
  for (var i = 0; i < pxs.length; i++) {
    if (pxs[i] != null){
      pxs[i].fade();
      pxs[i].move();
      pxs[i].draw();
    }
  } 

  // Visualize living particles
  drawHeatmap();
}

/* Heatmap Function */
function drawHeatmap() {
  heatmapData = [];
  for (particle in livingParticles) {
    // console.log(livingParticles[particle])
    var point = new google.maps.Point(livingParticles[particle].x, livingParticles[particle].y);
    var latlng = mapProjection.fromPointToLatLng(point);
    // console.log(latlng);
    heatmapData.push(latlng);
  }
  // console.log(heatmapData)
  var pointArray = (heatmapIsOn) ? new google.maps.MVCArray(heatmapData) : new google.maps.MVCArray();
  heatmap.setData(pointArray);
}

/* Particle Class */
function Circle(i) {
  this.settings = {
    time_to_live: trip_data[i].duration * 1000 * timeScale, 
    x_maxspeed: 5, 
    y_maxspeed: 2, 
    radius_max: 1, 
    rt: 1, 
    x_origin: trip_data[i].strt_long, 
    y_origin: trip_data[i].strt_lat,
    x_destination: trip_data[i].end_long,
    y_destination: trip_data[i].end_lat,
    xdrift: 4, 
    ydrift: 4, 
    random: false, 
    blink: false
  }

  this.settings['world_origin'] = map.getProjection().fromLatLngToPoint(new google.maps.LatLng(this.settings.y_origin, this.settings.x_origin))
  this.settings['world_destination'] = map.getProjection().fromLatLngToPoint(new google.maps.LatLng(this.settings.y_destination, this.settings.x_destination))

  this.reset = function() {
    this.x = (this.settings.random ? WIDTH*Math.random() : this.settings.world_origin.x);
    this.y = (this.settings.random ? HEIGHT*Math.random() : this.settings.world_origin.y);
    this.fx = (this.settings.randome ? WIDTH*MATH.random() : this.settings.world_destination.x);
    this.fy = (this.settings.randome ? HEIGHT*MATH.random() : this.settings.world_destination.y);
    this.r = 0.03;//((this.settings.radius_max-1)*Math.random()) + 1;
    // this.dx = (Math.random()*this.settings.x_maxspeed) * (Math.random() < .5 ? -1 : 1);
    // this.dy = (Math.random()*this.settings.y_maxspeed) * (Math.random() < .5 ? -1 : 1);
    this.dx = (this.fx - this.x) * (rint / this.settings.time_to_live);
    this.dy = (this.fy - this.y) * (rint / this.settings.time_to_live);
    // this.hl = (this.settings.time_to_live/rint)*(this.r/this.settings.radius_max);
    // this.rt = Math.random()*this.hl;
    // this.settings.rt = Math.random()+1;
    // this.stop = Math.random()*.2+.4;
    // this.settings.xdrift *= Math.random() * (Math.random() < .5 ? -1 : 1);
    // this.settings.ydrift *= Math.random() * (Math.random() < .5 ? -1 : 1);
    this.alive = true;
  }

  this.fade = function() {
    // this.rt += this.settings.rt;
    if ((Math.abs(this.x) - Math.abs(this.fx)) <= 0.0008 && ((Math.abs(this.y) - Math.abs(this.fy)) <= 0.0008)) {    
      this.x = this.fx;
      this.y = this.fy;
      this.r = 0;
      this.alive = false;
      livingParticles['p' + i] = null;
      delete livingParticles['p' + i];
      $('#monitor-box').text(Object.keys(livingParticles).length);
    } 
  }

  this.move = function() {
    if (this.alive) {
      // this.x += (this.rt/this.hl)*this.dx;
      // this.y += (this.rt/this.hl)*this.dy;
      this.x += this.dx;
      this.y += this.dy;
      // if(this.x > WIDTH || this.x < 0) this.dx *= -1;
      // if(this.y > HEIGHT || this.y < 0) this.dy *= -1;
    } 
  }

  this.draw = function() {
    // Draw the clock
    var currentTime = moment(tripStartTime + (moment() - drawStartTime) / timeScale);
    drawClock(currentTime);

    // if(this.settings.blink && (this.rt <= 0 || this.rt >= this.hl)) this.settings.rt = this.settings.rt*-1;
    // else if(this.rt >= this.hl) this.reset();
    // var newo = 1-(this.rt/this.hl);
    context.beginPath();
    context.arc(this.x,this.y,this.r,0,Math.PI*2,true);
    context.closePath();
    // var cr = this.r*newo;
    var cr = this.r * 0.008;
    g = context.createRadialGradient(this.x,this.y,0,this.x,this.y,(cr <= 0 ? 1 : cr));
    g.addColorStop(0.0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,1)');
    // g.addColorStop(0.0, 'rgba(255,255,255,'+newo+')');
    // g.addColorStop(this.stop, 'rgba(77,101,181,'+(newo*.6)+')');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    context.fillStyle = g;
    context.fill();
  }
}

/* Clock Drawing Functions */
function initClock() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  canvas.height = 200;
  canvas.width = 200;
  clockRadius = canvas.width / 2;
  ctx.translate(clockRadius, clockRadius);
  // ctx.translate(50, radius);
  clockRadius = clockRadius * 0.80
  // drawClock();  
}

function drawClock(time) {
  // Clear Canvas
  ctx.clearRect(-canvas.width/2, -canvas.height/2, canvas.width, canvas.height);

  // drawFace();
  drawNumbers();
  drawTime(time);
  drawSimpleTime(time);
}

function drawFace() {
  var grad;

  ctx.beginPath();
  ctx.arc(0, 0, clockRadius, 0, 2*Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();

  grad = ctx.createRadialGradient(0,0,clockRadius*0.95, 0,0,clockRadius*1.05);
  grad.addColorStop(0, '#333');
  grad.addColorStop(0.5, 'white');
  grad.addColorStop(1, '#333');
  ctx.strokeStyle = grad;
  ctx.lineWidth = clockRadius*0.1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, clockRadius*0.1, 0, 2*Math.PI);
  ctx.fillStyle = '#333';
  ctx.fill(); 
}

function drawNumbers() {
  var ang;
  var num;
  ctx.font = clockRadius*0.20 + "px sans-serif";
  ctx.fillStyle = "rgba(53,173,33, 1)";
  ctx.strokeStyle = "rgba(255,255,255, .8)";
  ctx.lineWidth = "1";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for(num = 1; num < 13; num++){
      ang = num * Math.PI / 6;
      ctx.rotate(ang);
      ctx.translate(0, -clockRadius*0.85);
      ctx.rotate(-ang);
      ctx.fillText(num.toString(), 0, 0);
      ctx.font = clockRadius*0.28 + "px sans-serif";
      ctx.strokeText(num.toString(), 0, 0);
      ctx.rotate(ang);
      ctx.translate(0, clockRadius*0.85);
      ctx.rotate(-ang);
  }
}

function drawTime(time){
  var hour = time.hours();
  var minute = time.minutes();
  var second = time.seconds();
  //hour
  hour=hour%12;
  hour=(hour*Math.PI/6)+(minute*Math.PI/(6*60))+(second*Math.PI/(360*60));
  drawHand(ctx, hour, clockRadius*0.5, clockRadius*0.07);
  //minute
  minute=(minute*Math.PI/30)+(second*Math.PI/(30*60));
  drawHand(ctx, minute, clockRadius*0.8, clockRadius*0.07);
  // second
  second=(second*Math.PI/30);
  // drawHand(ctx, second, clockRadius*0.9, clockRadius*0.02);
}

function drawHand(ctx, pos, length, width) {
  ctx.beginPath();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width*0.9;
  ctx.lineCap = "round";
  ctx.moveTo(0,0);
  ctx.rotate(pos);
  ctx.lineTo(0, -length*0.9);
  ctx.stroke();
  ctx.rotate(-pos);
}

function drawSimpleTime(time) {
  formattedTime = time.format('MMM DD YYYY HH:mm');
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = '#333';
  ctx.fillText(formattedTime, -45, canvas.height/2 - 10);
}

document.addEventListener('DOMContentLoaded', init, false);