document.addEventListener('DOMContentLoaded', function () {
  const uploadForm = document.getElementById('uploadForm');
  const progressBar = document.getElementById('progress');
  const resultVideo = document.getElementById('resultVideo');
  const resultDiv = document.getElementById('result');
  const statusText = document.getElementById('statusText');
  const spinner = document.getElementById('loadingSpinner');  // Ensure you have this reference

  uploadForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const videoFile = document.getElementById('videoFile').files[0];

    if (!videoFile) {
      alert('Please select a video file to upload.');
      return;
    }

    const formData = new FormData();
    // formData.append('video', videoFile);
    formData.append('image', videoFile)
    progressBar.style.width = '0%';
    statusText.innerText = 'Status: Uploading...';

    try {
      const response = await axios.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: function (progressEvent) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressBar.style.width = percentCompleted + '%';
        }
      });

      if (response.data && response.data.videoId) {
        statusText.innerText = 'Status: Processing...';
        checkVideoStatus(response.data.videoId);
      } else {
        spinner.classList.remove('show');
        alert('Failed to process video.');
        statusText.innerText = 'Status: Failed to process video.';
      }
    } catch (error) {
      console.error('Upload failed:', error);
      spinner.classList.remove('show'); // Hide spinner if there is an error
      alert('Video upload failed. Please try again.');
      statusText.innerText = 'Status: Video upload failed.';
    }
  });

  async function checkVideoStatus(videoId) {
    try {
      const response = await axios.get(`/status/${videoId}`);
      if (response.data && response.data.status) {
        const progress = response.data.progress || 0;
        statusText.innerText = `Status: ${response.data.status}, Progress: ${progress}%`;
        progressBar.style.width = `${progress}%`; // Update progress bar

        if (response.data.status.toLowerCase() === 'processing') {
          spinner.classList.add('show');
          setTimeout(() => checkVideoStatus(videoId), 1000); // Check status every second
        } else {
          spinner.classList.remove('show');
          if (response.data.status.toLowerCase() === 'done') {
            resultVideo.src = `/video/${videoId}`;
            resultVideo.style.display = 'block';
            resultDiv.scrollIntoView();
            progressBar.style.width = '100%';
          } else if (response.data.status.toLowerCase() === 'error') {
            progressBar.style.backgroundColor = '#e74c3c'; // red color for error
            alert('Error processing video. Please try again.');
          }
        }
      } else {
        spinner.classList.remove('show');
        alert('Failed to get video status.');
        statusText.innerText = 'Status: Failed to get video status.';
      }
    } catch (error) {
      spinner.classList.remove('show');
      console.error('Status check failed:', error);
      alert('Failed to check video status. Please try again.');
      statusText.innerText = 'Status: Failed to check video status.';
    }
  }
});
