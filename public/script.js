document.addEventListener('DOMContentLoaded', function () {
  const searchForm = document.getElementById('searchForm');
  const searchTermInput = document.getElementById('searchTerm');
  const nextButton = document.getElementById('nextButton');
  const prevButton = document.getElementById('prevButton');
  const progressBar = document.getElementById('progress');
  const resultImage = document.getElementById('resultImage');
  const resultDiv = document.getElementById('result');
  const statusText = document.getElementById('statusText');
  const predictionsList = document.getElementById('predictionsList');
  const spinner = document.getElementById('loadingSpinner');

  let currentImageIndex = 1;

  function updateImageDisplay(imageUrl) {
    resultImage.src = imageUrl;
    resultImage.style.display = 'block';
    resultImage.onload = () => {
      progressBar.style.width = '100%';
    };
  }

  function displayPredictions(predictions) {
    const predictionsHtml = predictions.map((prediction) => `<li>${prediction.class}</li>`).join('');
    predictionsList.innerHTML = predictionsHtml || '<li>No objects detected</li>';
  }

  function handleError(error) {
    console.error('Search failed:', error);
    alert('Image search failed. Please try again.');
    statusText.innerText = 'Status: Image search failed.';
    spinner.classList.remove('show');
  }

  async function fetchImage(searchTerm, index) {
    progressBar.style.width = '0%';
    statusText.innerText = 'Status: Searching...';
    spinner.classList.add('show');

    try {
      const params = new URLSearchParams({ term: searchTerm, index });
      const response = await axios.get(`/search?${params.toString()}`);

      if (response.status === 200 && response.data.imageUrl) {
        updateImageDisplay(response.data.imageUrl);
        displayPredictions(response.data.predictions);
        statusText.innerText = 'Status: Done';
      } else {
        statusText.innerText = 'Status: No images found.';
      }
    } catch (error) {
      handleError(error);
    } finally {
      spinner.classList.remove('show');
    }
  }

  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const searchTerm = searchTermInput.value.trim();
    if (!searchTerm) {
      alert('Please enter a search term.');
      return;
    }
    currentImageIndex = 1; // Reset index for new search
    fetchImage(searchTerm, currentImageIndex);
  });

  nextButton.addEventListener('click', function () {
    const searchTerm = searchTermInput.value.trim();
    currentImageIndex++;
    // Always fetch a new image when the next button is clicked
    fetchImage(searchTerm, currentImageIndex);
  });
  
  prevButton.addEventListener('click', function () {
    const searchTerm = searchTermInput.value.trim();
    if (currentImageIndex > 0) {
      currentImageIndex--;
      // Always fetch a new image when the previous button is clicked
      fetchImage(searchTerm, currentImageIndex);
    }
  });
});
