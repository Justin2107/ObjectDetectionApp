const express = require('express');
const multer = require('multer');
const tf = require('@tensorflow/tfjs-node');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const redis = require('redis');
require('dotenv').config();
// const AWS = require('aws-sdk');
const { createFlickr, APIKeyAuth } = require('flickr-sdk');
const https = require('https');

const app = express();
const port = 3000;
const uploadDir = 'uploads';
const annotatedDir = 'annotated_videos';
const framesDir = path.join('uploads', 'frames');

const flickrKey = "368ceefc84c0bd15fa71e48371879b96"

// Redis setup
const redisClient = redis.createClient();
(async () => {
    try {
      await  redisClient.connect();  
    } catch (err) {
      console.log(err);
    }
})();

// Cloud Services Set-up 
const bucketName = "n10262806-cloud-project";
// const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

// (async () => {
//   try {
//     await s3.createBucket({ Bucket: bucketName }).promise();
//     console.log(`Created bucket: ${bucketName}`);
//   } catch (err) {
//     // We will ignore 409 errors which indicate that the bucket already exists
//     if (err.statusCode !== 409) {
//       console.log(`Error creating bucket: ${err}`);
//     }
//   }
// })();

// Ensure upload and annotated directories exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(annotatedDir)) fs.mkdirSync(annotatedDir);
if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);

app.use(express.static(path.join(__dirname, 'public')));

let model;
let modelLoaded = new Promise(async (resolve, reject) => {
  try {
    model = await cocoSsd.load();
    console.log('Model loaded');
    resolve(); // Resolve the promise once the model is loaded
  } catch (error) {
    console.error('Error loading model:', error);
    reject(error); // Reject the promise if there is an error
  }
});

app.get('/search', async (req, res) => {
  const searchTerm = req.query.term;
  if (!searchTerm) {
    return res.status(400).send('Search term is required.');
  }
  const index = req.query.index;

  const flickrApiUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${flickrKey}&text=${encodeURIComponent(searchTerm)}&format=json&nojsoncallback=1&safe_search=1&content_type=1&media=photos&per_page=1&page=${index}`;

  https.get(flickrApiUrl, flickrRes => {
    let data = '';
    flickrRes.on('data', chunk => {
      data += chunk;
    });
    flickrRes.on('end', async () => {
      const responseJson = JSON.parse(data);
      if (responseJson.photos.photo.length === 0) {
        return res.status(404).send('No images found.');
      }
      const photo = responseJson.photos.photo[0];
      const photoUrl = `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
      
      // Download the image using the photoUrl
      const imagePath = `uploads/${photo.id}.jpg`;
      const file = fs.createWriteStream(imagePath);
      https.get(photoUrl, response => {
        response.pipe(file);
        file.on('finish', async () => {
          file.close();
          console.log('Downloaded image successfully');
          
          const imageHash = await calculateFileHash(imagePath);
          const redisKey = `object-detection:${imageHash}`;  // Create a unique key for Redis
          // const s3Key = `object-detection-${imageHash}.json`;  // Key for storing JSON in S3

          // Check in Redis
          const cachedResult = await redisClient.get(redisKey);
          if (cachedResult) {
            console.log("Fetched from Redis Cache");
            results = JSON.parse(cachedResult)
            await annotateImageFromCache(imagePath, results.predictions)
            return res.json(JSON.parse(cachedResult));
          }

          // Check in S3
          // try {
          //   const s3Result = await s3.getObject({ Bucket: bucketName, Key: s3Key }).promise();
          //   console.log("Fetched from S3 Bucket");
          //   results = JSON.parse(s3Result.Body.toString())
          //   await annotateImageFromCache(imagePath, results.predictions)
          //   return res.json(JSON.parse(s3Result.Body.toString()));
          // } catch (err) {
          //   if (err.statusCode !== 404) { // Not found error
          //     console.error('Error fetching from S3:', err);
          //     return res.status(500).send('Error fetching from S3');
          //   }
          // }

          // After downloading, run the object detection model
          try {
            await modelLoaded;
            const predictions = await annotateImage(model, imagePath);
            const predictionClasses = predictions.map(prediction => prediction.class);
            const imageHash = await calculateFileHash(imagePath)

            // Once annotated, send the image back to the client
            // res.status(200).sendFile(imagePath, { root: __dirname });
            const responseData = {
              imageUrl: `/annotated/${path.basename(imagePath)}`,
              predictions: predictions,
              imageHash: imageHash,
            };
            
            // Store results in Redis and S3
            await redisClient.setEx(redisKey, 3600, JSON.stringify(responseData));
            // await s3.putObject({
            //   Bucket: bucketName,
            //   Key: s3Key,
            //   Body: JSON.stringify(responseData)
            // }).promise();
            return res.json(responseData);
          } catch (error) {
            console.error('Error processing image:', error);
            return res.status(500).send('Error processing image');
          }
        });
      }).on('error', err => {
        fs.unlink(imagePath, () => { /* handle unlink errors if any */ });
        console.error('Error downloading image:', err);
        return res.status(500).send('Error downloading image');
      });

    });
  }).on('error', err => {
    console.error('Error with Flickr API request:', err);
    return res.status(500).send('Error searching Flickr');
  });
});


app.get('/annotated/:imageName', (req, res) => {
  const imageName = req.params.imageName;
  const imagePath = path.resolve(uploadDir, imageName);

  if (!fs.existsSync(imagePath)) {
    return res.status(404).send('Image not found');
  }

  const mimeType = mime.lookup(imagePath) || 'image/png';
  res.status(200).sendFile(imagePath, { headers: { 'Content-Type': mimeType } });
  // Set a delay to delete the file, giving the client time to download
  res.on('finish', () => {
    fs.unlink(imagePath, (err) => {
      if (err) console.error(`Error deleting file ${imagePath}:`, err);
      else console.log(`Successfully deleted file ${imagePath}`);
    });
  });
});

// Annotate single image
async function annotateImage(model, imagePath) {
  const image = await loadImage(imagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const predictions = await model.detect(canvas);

  predictions.forEach(prediction => {
    ctx.beginPath();
    ctx.rect(...prediction.bbox);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'red';
    ctx.fillStyle = 'red';
    ctx.stroke();
    ctx.fillText(`${prediction.class} (${Math.round(prediction.score * 100)}%)`, prediction.bbox[0], prediction.bbox[1] > 10 ? prediction.bbox[1] - 5 : 10);
  });

  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  return predictions;
}

// Annotate single image
async function annotateImageFromCache(imagePath, predictions) {
  const image = await loadImage(imagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  // const predictions = await model.detect(canvas);
  predictions.forEach(prediction => {
    ctx.beginPath();
    ctx.rect(...prediction.bbox);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'red';
    ctx.fillStyle = 'red';
    ctx.stroke();
    ctx.fillText(`${prediction.class} (${Math.round(prediction.score * 100)}%)`, prediction.bbox[0], prediction.bbox[1] > 10 ? prediction.bbox[1] - 5 : 10);
  });

  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  // return predictions;
}

function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data, 'utf8');
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
