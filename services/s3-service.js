/**
 * S3 Service for uploading images to AWS S3
 * Falls back to local storage if AWS is not configured
 */

const fs = require('fs').promises;
const path = require('path');

class S3Service {
    constructor() {
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
        this.region = process.env.AWS_REGION || 'us-east-1';
        this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        this.s3Client = null;
        
        this.isConfigured = !!(this.bucketName && this.accessKeyId && this.secretAccessKey);
        
        if (this.isConfigured) {
            console.log('🔗 S3 service configured for bucket:', this.bucketName);
        } else {
            console.log('⚠️  S3 not configured, falling back to local storage');
        }
    }

    async initializeS3Client() {
        if (!this.isConfigured || this.s3Client) return;

        try {
            // Try to import AWS SDK v3
            const { S3Client } = require('@aws-sdk/client-s3');
            this.s3Client = new S3Client({
                region: this.region,
                credentials: {
                    accessKeyId: this.accessKeyId,
                    secretAccessKey: this.secretAccessKey
                }
            });
            console.log('✅ AWS S3 client initialized');
        } catch (error) {
            console.log('⚠️  AWS SDK not available, using local storage fallback');
            this.isConfigured = false;
        }
    }

    /**
     * Upload image to S3 or local storage
     * @param {Buffer} imageBuffer - Image data as buffer
     * @param {string} fileName - File name (e.g., 'daily-group1-123456.png')
     * @returns {string} - Public URL of the uploaded image
     */
    async uploadImage(imageBuffer, fileName) {
        await this.initializeS3Client();

        if (this.isConfigured && this.s3Client) {
            return await this.uploadToS3(imageBuffer, fileName);
        } else {
            return await this.uploadToLocal(imageBuffer, fileName);
        }
    }

    async uploadToS3(imageBuffer, fileName) {
        try {
            const { PutObjectCommand } = require('@aws-sdk/client-s3');
            
            const key = `images/${fileName}`;
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: imageBuffer,
                ContentType: 'image/png',
                CacheControl: 'max-age=31536000', // 1 year cache
            });

            await this.s3Client.send(command);
            
            const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
            console.log(`📤 Uploaded to S3: ${publicUrl}`);
            
            return publicUrl;
        } catch (error) {
            console.error('❌ S3 upload failed:', error);
            // Fallback to local storage
            return await this.uploadToLocal(imageBuffer, fileName);
        }
    }

    async uploadToLocal(imageBuffer, fileName) {
        try {
            const generatedDir = path.join(__dirname, '..', 'public', 'images', 'generated');
            await fs.mkdir(generatedDir, { recursive: true });
            
            const filePath = path.join(generatedDir, fileName);
            await fs.writeFile(filePath, imageBuffer);
            
            const publicUrl = `/images/generated/${fileName}`;
            console.log(`💾 Saved locally: ${publicUrl}`);
            
            return publicUrl;
        } catch (error) {
            console.error('❌ Local storage failed:', error);
            throw error;
        }
    }

    /**
     * Check if an image exists (for local storage only)
     * @param {string} fileName - File name to check
     * @returns {boolean} - True if file exists
     */
    async imageExists(fileName) {
        if (this.isConfigured) {
            // For S3, assume images exist once uploaded
            return true;
        }

        try {
            const filePath = path.join(__dirname, '..', 'public', 'images', 'generated', fileName);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the base URL for images
     * @returns {string} - Base URL
     */
    getImageBaseUrl() {
        if (this.isConfigured) {
            return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/images/`;
        } else {
            return '/images/generated/';
        }
    }
}

module.exports = S3Service;