# Initialize a new Node.js project (skip this step if you've already done it)
echo "Initializing Node.js project..."
npm init -y

# Install required npm packages
echo "Installing required npm packages..."
npm install express multer @tensorflow/tfjs-node @tensorflow-models/coco-ssd canvas fluent-ffmpeg

# Install ffmpeg
sudo apt install ffmpeg