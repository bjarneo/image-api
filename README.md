# Image Processing API

This is a Node.js-based Image Processing API that allows you to perform various operations on images, including rotation, resizing, cropping, and format conversion. The API also implements caching to improve performance for repeated requests.

## Features

- Image rotation
- Image resizing
- Image cropping
- Format conversion (jpeg, png, webp, jpg, avif, gif)
- Quality adjustment
- Caching of processed images

Missing

- Many other things from the sharp package https://sharp.pixelplumbing.com/
- Needs a refactor, made this in ~2 hours

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)

## Installation

```bash
# clone the repository

npm install
npm run dev

// http://localhost:3003
```

## Docker

```bash
docker run -it --rm --name image-api -p 3003:3003 \
  -v $(pwd)/image-api-cache:/usr/src/app/cache \ # Remember to mount the image cache directory
  -d bjarneo/image-api
```

## API Endpoints

See swagger documentation at http://localhost:3003/api-docs

## Examples

Have a look at the `example.html`, and the `example2.html` files in the `examples` directory for examples of how to use the API.

### License

This project is licensed under the MIT License.
