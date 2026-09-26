import React, { useEffect, useRef } from 'react';
import { View, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  isDriver?: boolean;
  isOffRoute?: boolean;
}

interface LiveMapWebProps {
  markers: MapMarker[];
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
}

export default function LiveMapWeb({ 
  markers, 
  centerLat = -16.4950, 
  centerLng = -68.1333,
  zoom = 15
}: LiveMapWebProps) {
  const iframeRef = useRef<any>(null);
  const webviewRef = useRef<WebView>(null);

  // Send new markers to the iframe seamlessly without triggering a full iframe reload
  useEffect(() => {
    if (Platform.OS === 'web' && iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify(markers), '*');
    }
  }, [markers]);

  // Send new markers to the webview seamlessly on native devices
  useEffect(() => {
    if (Platform.OS !== 'web' && webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify(markers));
    }
  }, [markers]);

  // Send center and zoom updates to the iframe dynamically
  useEffect(() => {
    if (Platform.OS === 'web' && iframeRef.current && iframeRef.current.contentWindow) {
      const payload = {
        center: [centerLat, centerLng],
        zoom: zoom
      };
      iframeRef.current.contentWindow.postMessage(JSON.stringify(payload), '*');
    }
  }, [centerLat, centerLng, zoom]);

  // Send center and zoom updates to the webview dynamically
  useEffect(() => {
    if (Platform.OS !== 'web' && webviewRef.current) {
      const payload = {
        center: [centerLat, centerLng],
        zoom: zoom
      };
      webviewRef.current.postMessage(JSON.stringify(payload));
    }
  }, [centerLat, centerLng, zoom]);

  const initialMarkersJson = JSON.stringify(markers);
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; overflow: hidden; background: #f8fafc; }
        #map { width: 100vw; height: 100vh; }
        .custom-div-icon {
          background-color: transparent;
          border: none;
        }
        .marker-pin {
          width: 24px;
          height: 24px;
          border-radius: 50% 50% 50% 0;
          background: #32cd32;
          position: absolute;
          transform: rotate(-45deg);
          left: 50%;
          top: 50%;
          margin: -12px 0 0 -12px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
          border: 2px solid white;
          transition: all 0.3s ease;
        }
        .marker-pin.driver { 
          background: #0056b3; 
          width: 28px;
          height: 28px;
          margin: -14px 0 0 -14px;
        }
        .marker-pin.off-route { 
          background: #ef4444; 
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        
        /* Premium custom map controls */
        .map-controls {
          position: absolute;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .control-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: bold;
          transition: all 0.2s ease;
          color: #334155;
          user-select: none;
          outline: none;
        }
        .control-btn:active {
          transform: scale(0.95);
          background: #f1f5f9;
        }
        .control-btn.locate {
          color: #00327d;
          background: #f0f7ff;
          border-color: #93c5fd;
        }
        .control-btn.locate:active {
          background: #dbeafe;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div class="map-controls">
        <button class="control-btn" onclick="map.zoomIn()" title="Acercar">＋</button>
        <button class="control-btn" onclick="map.zoomOut()" title="Alejar">－</button>
        <button class="control-btn locate" onclick="centerOnDriver()" title="Centrar mi ubicación">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
          </svg>
        </button>
      </div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], ${zoom});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        var currentMarkers = {};
        var userDraggedMap = false;

        // Detect user interactions to stop auto-centering
        map.on('dragstart zoomstart', function() {
          userDraggedMap = true;
        });

        function centerOnDriver() {
          userDraggedMap = false;
          var driverLatLng = null;
          for (var id in currentMarkers) {
            if (currentMarkers[id].isDriver) {
              driverLatLng = currentMarkers[id].getLatLng();
              break;
            }
          }
          if (driverLatLng) {
            map.setView(driverLatLng, 16, { animate: true });
          } else {
            map.setView([${centerLat}, ${centerLng}], 16, { animate: true });
          }
        }

        function renderMarkers(markersData) {
          // Clear existing
          for (var id in currentMarkers) {
            map.removeLayer(currentMarkers[id]);
          }
          currentMarkers = {};

          var driverLatLng = null;

          markersData.forEach(function(m) {
            var pinClass = m.isOffRoute ? "off-route" : (m.isDriver ? "driver" : "");
            var iconHtml = "<div class='marker-pin " + pinClass + "'></div>";
            var customIcon = L.divIcon({
              className: 'custom-div-icon',
              html: iconHtml,
              iconSize: [30, 42],
              iconAnchor: [15, 42]
            });
            var marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
            marker.bindPopup("<b>" + m.title + "</b>");
            
            // Tag if it is the driver
            marker.isDriver = m.isDriver;
            currentMarkers[m.id] = marker;

            if (m.isDriver) {
              driverLatLng = [m.lat, m.lng];
            }
          });
          
          // Auto-pan if only 1 driver marker or first load, AND the user hasn't dragged/zoomed away manually
          if (!userDraggedMap && driverLatLng) {
             map.panTo(driverLatLng, { animate: true });
          }
        }
        
        // Initial render
        renderMarkers(${initialMarkersJson});
        
        // Listen for React Native Web postMessage updates
        var handleMessage = function(event) {
          try {
            var data = JSON.parse(event.data);
            if (Array.isArray(data)) {
              renderMarkers(data);
            } else if (data && typeof data === 'object') {
              if (data.markers && Array.isArray(data.markers)) {
                renderMarkers(data.markers);
              }
              if (data.center && Array.isArray(data.center)) {
                if (!userDraggedMap) {
                  map.panTo(data.center, { animate: true });
                }
              }
              if (typeof data.zoom === 'number') {
                map.setZoom(data.zoom);
              }
            }
          } catch(e) {}
        };
        window.addEventListener('message', handleMessage);
        document.addEventListener('message', handleMessage);
      </script>
    </body>
    </html>
  `;

  // Fallback for native devices using react-native-webview
  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, overflow: 'hidden', borderRadius: 12 }}>
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      </View>
    );
  }

  // React Native Web doesn't have an <iframe /> typing out of the box, we use createElement
  return React.createElement('iframe', {
    ref: iframeRef,
    srcDoc: htmlContent,
    style: { width: '100%', height: '100%', border: 'none', borderRadius: 12 },
    title: "Live Map"
  });
}
