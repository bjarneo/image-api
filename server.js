import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import Joi from "joi";
import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import swaggerUI from "swagger-ui-express";
import YAML from "yamljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3003;
const cacheDir = path.join(__dirname, "cache");

// --- Utility Functions ---
const generateCacheKey = async (reqBody, fileBuffer) => {
	return crypto
		.createHash("md5")
		.update(
			JSON.stringify({
				...reqBody,
				fileHash: crypto.createHash("md5").update(fileBuffer).digest("hex"),
			}),
		)
		.digest("hex");
};

const getProcessedImagePath = (cacheKey, format) =>
	path.join(cacheDir, `${cacheKey}.${format}`);

const imageProcessingSchema = Joi.object({
	rotate: Joi.number().integer().min(0).max(360).optional(),
	resize: Joi.object({
		width: Joi.number().integer().positive().optional(),
		height: Joi.number().integer().positive().optional(),
		fit: Joi.string()
			.valid("cover", "contain", "fill", "inside", "outside")
			.optional(),
		position: Joi.string().optional(),
	}).optional(),
	crop: Joi.object({
		left: Joi.number().integer().min(0).required(),
		top: Joi.number().integer().min(0).required(),
		width: Joi.number().integer().positive().required(),
		height: Joi.number().integer().positive().required(),
	}).optional(),
	format: Joi.string()
		.valid("jpeg", "png", "webp", "jpg", "avif", "gif")
		.optional(),
	quality: Joi.number().integer().min(1).max(100).optional(),
});

const handleImageProcessing = async (req, res) => {
	// Transform hacky stringified JSON values to actual JSON objects
	if (req.body.resize && typeof req.body.resize === "string") {
		req.body.resize = JSON.parse(req.body.resize);
	}

	if (req.body.crop && typeof req.body.crop === "string") {
		req.body.crop = JSON.parse(req.body.crop);
	}

	// Validate the request body
	const { error } = imageProcessingSchema.validate(req.body);
	if (error) {
		return res.status(400).json({ error: error.details[0].message });
	}

	try {
		if (!req.file) {
			return res.status(400).json({ error: "No image file uploaded" });
		}

		const { rotate, resize, format, crop, quality } = req.body;
		const fileBuffer = await fs.readFile(req.file.path);
		const fileType = await fileTypeFromBuffer(fileBuffer);

		if (!fileType || !fileType.mime.startsWith("image/")) {
			return res
				.status(400)
				.json({ error: "Invalid file type. Only images are allowed." });
		}

		const metadata = await sharp(fileBuffer).metadata();

		const fileFormat = format || metadata.format;
		const cacheKey = await generateCacheKey(req.body, fileBuffer);
		const cachePath = getProcessedImagePath(cacheKey, fileFormat);

		// Check if cached version exists
		if (fsSync.existsSync(cachePath)) {
			const stats = await fs.stat(cachePath);
			const { width, height } = await sharp(cachePath).metadata();

			// Clean up the uploaded file
			fs.unlink(req.file.path);

			return res.json({
				state: "cache",
				key: cacheKey,
				format: fileFormat,
				image: `${cacheKey}.${fileFormat}`,
				size: stats.size,
				width,
				height,
			});
		}

		// Process the image
		const image = sharp(req.file.path);

		if (rotate) {
			image.rotate(Number.parseInt(rotate));
		}

		if (resize) {
			image.resize(resize.width, resize.height, {
				fit: resize.fit || "cover",
				position: resize.position || "center",
			});
		}

		if (crop) {
			image.extract({
				left: Number.parseInt(crop.left),
				top: Number.parseInt(crop.top),
				width: Number.parseInt(crop.width),
				height: Number.parseInt(crop.height),
			});
		}

		if (format) {
			image.toFormat(fileFormat, { quality: Number.parseInt(quality) || 80 });
		}

		// Save the processed image
		await image.toFile(cachePath);

		// Get image metadata
		const { width, height } = await image.metadata();
		const stats = await fs.stat(cachePath);

		// Clean up the uploaded file
		fs.unlink(req.file.path);

		res.json({
			state: "processed",
			key: cacheKey,
			format: fileFormat,
			image: `${cacheKey}.${fileFormat}`,
			size: stats.size,
			width,
			height,
		});
	} catch (error) {
		// Clean up the uploaded file in case of error
		if (req.file) {
			fs.unlink(req.file.path);
		}

		res.status(500).json({ error: error.message });
	}
};

// --- Middleware ---

app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });
app.use("/cache", express.static("cache"));
app.use(
	"/api-docs",
	swaggerUI.serve,
	swaggerUI.setup(YAML.load("swagger.yaml")),
);

// --- Routes ---
app.post("/image", upload.single("image"), handleImageProcessing);

app.get("/image/:image", async (req, res) => {
	const { image } = req.params;
	const cachePath = path.join(cacheDir, image);

	if (!fsSync.existsSync(cachePath)) {
		return res.status(404).json({ error: "Image not found" });
	}

	res.sendFile(cachePath);
});

app.listen(port, () => {
	console.log(`Image API listening at http://localhost:${port}`);
});
