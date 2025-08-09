document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const takePhotoBtn = document.getElementById('takePhoto');
    const switchCameraBtn = document.getElementById('switchCamera');
    const recordVideoBtn = document.getElementById('recordVideo');
    const lastPhoto = document.getElementById('lastPhoto');
    const lastVideo = document.getElementById('lastVideo');
    const clearMediaBtn = document.getElementById('clearMedia');
    const filterOptions = document.querySelectorAll('.filter-option');
    const recordingTimer = document.getElementById('recordingTimer');
    const audioToggle = document.getElementById('audioToggle');
    
    // Variables
    let currentStream = null;
    let currentFacingMode = 'user';
    let mediaRecorder = null;
    let recordedChunks = [];
    let currentFilter = 'none';
    let isRecording = false;
    let recordingStartTime = 0;
    let timerInterval = null;
    let audioEnabled = true;
    
    // Initialize camera
    async function initCamera(facingMode = 'user') {
        stopCamera();
        
        try {
            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: audioEnabled ? { echoCancellation: true } : false
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            currentStream = stream;
            video.srcObject = stream;
            currentFacingMode = facingMode;
            
            // Apply mirror effect only for front camera
            if (facingMode === 'user') {
                video.style.transform = 'scaleX(-1)';
            } else {
                video.style.transform = 'scaleX(1)';
            }
            
            return true;
        } catch (err) {
            console.error("Error accessing camera: ", err);
            alert("Could not access the camera. Please make sure you have granted camera permissions.");
            return false;
        }
    }
    
    // Stop camera stream
    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    }
    
    // Switch between front and back camera
    async function switchCamera() {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        await initCamera(currentFacingMode);
    }
    
    // Take photo
    function takePhoto() {
        if (!currentStream) return;
        
        const width = video.videoWidth;
        const height = video.videoHeight;
        
        canvas.width = width;
        canvas.height = height;
        
        const context = canvas.getContext('2d');
        
        // Draw video frame to canvas
        if (currentFacingMode === 'user') {
            // Mirror for front camera
            context.translate(width, 0);
            context.scale(-1, 1);
        }
        context.drawImage(video, 0, 0, width, height);
        
        // Reset transform
        context.setTransform(1, 0, 0, 1, 0, 0);
        
        // Apply selected filter
        applyFilter(context, width, height);
        
        // Create image from canvas
        const imageDataUrl = canvas.toDataURL('image/png');
        lastPhoto.src = imageDataUrl;
        lastPhoto.style.display = 'block';
        lastVideo.style.display = 'none';
        
        // Download the image automatically
        downloadImage(imageDataUrl);
    }
    
    // Apply filter to canvas
    function applyFilter(context, width, height) {
        if (currentFilter === 'none') return;
        
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Apply different filters based on selection
        switch(currentFilter) {
            case 'grayscale':
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = avg;
                    data[i + 1] = avg;
                    data[i + 2] = avg;
                }
                break;
                
            case 'sepia':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
                    data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
                    data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
                }
                break;
                
            case 'invert':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
                break;
                
            case 'hue-rotate':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = r * 0.293 + g * 0.707 + b * 0;
                    data[i + 1] = r * 0.293 + g * 0.707 + b * 0;
                    data[i + 2] = r * 0 + g * 0 + b * 1;
                }
                break;
                
            case 'contrast':
                const contrastFactor = 2.5;
                const intercept = 128 * (1 - contrastFactor);
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * contrastFactor + intercept;
                    data[i + 1] = data[i + 1] * contrastFactor + intercept;
                    data[i + 2] = data[i + 2] * contrastFactor + intercept;
                }
                break;
                
            case 'saturate':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                    data[i] = -0.8373 * gray + 1.8373 * r;
                    data[i + 1] = -0.8373 * gray + 1.8373 * g;
                    data[i + 2] = -0.8373 * gray + 1.8373 * b;
                }
                break;
                
            case 'blur':
                // Simple box blur
                const tempData = new Uint8ClampedArray(data);
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const idx = (y * width + x) * 4;
                        let r = 0, g = 0, b = 0;
                        
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const didx = ((y + dy) * width + (x + dx)) * 4;
                                r += tempData[didx];
                                g += tempData[didx + 1];
                                b += tempData[didx + 2];
                            }
                        }
                        
                        data[idx] = r / 9;
                        data[idx + 1] = g / 9;
                        data[idx + 2] = b / 9;
                    }
                }
                break;
                
            case 'warm':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * 1.2;
                    data[i + 1] = data[i + 1] * 1.1;
                    data[i + 3] = data[i + 3] * 0.9;
                }
                break;
                
            case 'cool':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * 0.9;
                    data[i + 1] = data[i + 1] * 0.9;
                    data[i + 2] = data[i + 2] * 1.2;
                }
                break;
                
            case 'vintage':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = (r * 0.393) + (g * 0.769) + (b * 0.189);
                    data[i + 1] = (r * 0.349) + (g * 0.686) + (b * 0.168);
                    data[i + 2] = (r * 0.272) + (g * 0.534) + (b * 0.131);
                    data[i + 3] = data[i + 3] * 0.8;
                }
                break;
                
            case 'blackwhite':
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    const bw = avg > 128 ? 255 : 0;
                    data[i] = bw;
                    data[i + 1] = bw;
                    data[i + 2] = bw;
                }
                break;
                
            case 'technicolor':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = (r * 1.2) + (g * 0.1) + (b * 0.1);
                    data[i + 1] = (r * 0.1) + (g * 1.2) + (b * 0.1);
                    data[i + 2] = (r * 0.1) + (g * 0.1) + (b * 1.2);
                }
                break;
                
            case 'polaroid':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = Math.min(255, (r * 1.08) + (g * 0.2) + (b * 0.1));
                    data[i + 1] = Math.min(255, (r * 0.1) + (g * 1.08) + (b * 0.2));
                    data[i + 2] = Math.min(255, (r * 0.1) + (g * 0.2) + (b * 1.08));
                    data[i + 3] = data[i + 3] * 0.9;
                }
                break;
                
            case 'kodachrome':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = Math.min(255, (r * 1.25) - 20);
                    data[i + 1] = Math.min(255, (g * 1.03) - 10);
                    data[i + 2] = Math.min(255, (b * 0.9) + 5);
                }
                break;
                
            case 'brownie':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * 0.9;
                    data[i + 1] = data[i + 1] * 0.7;
                    data[i + 2] = data[i + 2] * 0.6;
                    data[i + 3] = data[i + 3] * 0.9;
                }
                break;
                
            case 'lofi':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * 1.3;
                    data[i + 1] = data[i + 1] * 1.3;
                    data[i + 2] = data[i + 2] * 1.1;
                    data[i + 3] = data[i + 3] * 1.1;
                }
                break;
                
            case 'sunset':
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = data[i] * 1.8;
                    data[i + 1] = data[i + 1] * 1.4;
                    data[i + 2] = data[i + 2] * 0.6;
                }
                break;
                
            case 'night':
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = avg * 0.8;
                    data[i + 1] = avg * 0.5;
                    data[i + 2] = avg * 1.2;
                    data[i + 3] = data[i + 3] * 0.9;
                }
                break;
                
            case 'rainbow':
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    data[i] = (r * 1.5) + (g * 0.5) + (b * 0.1);
                    data[i + 1] = (r * 0.1) + (g * 1.5) + (b * 0.5);
                    data[i + 2] = (r * 0.5) + (g * 0.1) + (b * 1.5);
                }
                break;
        }
        
        context.putImageData(imageData, 0, 0);
    }
    
    // Download image
    function downloadImage(dataUrl) {
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `photo-${timestamp}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Update recording timer
    function updateTimer() {
        const currentTime = Date.now();
        const elapsedTime = Math.floor((currentTime - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
        const seconds = (elapsedTime % 60).toString().padStart(2, '0');
        recordingTimer.textContent = `${minutes}:${seconds}`;
    }
    
    // Start video recording
    async function startRecording() {
        if (!currentStream) return;
        
        // Check if we need to reinitialize stream with audio
        if (audioEnabled && !currentStream.getAudioTracks().length) {
            const success = await initCamera(currentFacingMode);
            if (!success) return;
        }
        
        recordedChunks = [];
        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        
        try {
            mediaRecorder = new MediaRecorder(currentStream, options);
        } catch (e) {
            console.error('MediaRecorder error:', e);
            try {
                // Fallback to VP8 if VP9 is not supported
                options.mimeType = 'video/webm;codecs=vp8,opus';
                mediaRecorder = new MediaRecorder(currentStream, options);
            } catch (e2) {
                console.error('MediaRecorder fallback error:', e2);
                alert('Your browser does not support video recording with the selected codecs.');
                return;
            }
        }
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = function() {
            clearInterval(timerInterval);
            recordingTimer.style.display = 'none';
            
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(blob);
            
            lastVideo.src = videoUrl;
            lastVideo.style.display = 'block';
            lastPhoto.style.display = 'none';
            
            // Download the video
            downloadVideo(blob);
        };
        
        mediaRecorder.start(100);
        isRecording = true;
        recordingStartTime = Date.now();
        recordingTimer.style.display = 'block';
        timerInterval = setInterval(updateTimer, 1000);
        recordVideoBtn.textContent = 'Stop Recording';
        recordVideoBtn.classList.add('recording');
    }
    
    // Stop video recording
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            recordVideoBtn.textContent = 'Record Video';
            recordVideoBtn.classList.remove('recording');
        }
    }
    
    // Download video
    function downloadVideo(blob) {
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `video-${timestamp}.webm`;
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Clear media preview
    function clearMedia() {
        lastPhoto.src = '';
        lastVideo.src = '';
        lastPhoto.style.display = 'none';
        lastVideo.style.display = 'none';
    }
    
    // Event listeners
    switchCameraBtn.addEventListener('click', switchCamera);
    takePhotoBtn.addEventListener('click', takePhoto);
    recordVideoBtn.addEventListener('click', function() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    clearMediaBtn.addEventListener('click', clearMedia);
    audioToggle.addEventListener('change', function() {
        audioEnabled = this.checked;
        initCamera(currentFacingMode);
    });
    
    // Filter selection
    filterOptions.forEach(option => {
        option.addEventListener('click', function() {
            filterOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
        });
    });
    
    // Initialize with front camera
    initCamera();
});