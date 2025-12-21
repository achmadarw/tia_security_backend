#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract face embeddings using MobileFaceNet (TFLite) - 192 dimensions
This matches the Flutter mobile app's embedding model.
"""

import os
import sys
import json
import psycopg2
from pathlib import Path
import numpy as np
from PIL import Image
import cv2

# Force UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'ignore')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'ignore')

# Try to import TensorFlow Lite
try:
    import tflite_runtime.interpreter as tflite
    print("[INFO] Using tflite_runtime")
except ImportError:
    try:
        import tensorflow as tf
        tflite = tf.lite
        print("[INFO] Using tensorflow.lite")
    except ImportError:
        print("[ERROR] Neither tflite_runtime nor tensorflow is installed!")
        print("[ERROR] Install with: pip install tflite-runtime or pip install tensorflow")
        sys.exit(1)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'tia_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres')
}

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
UPLOAD_DIR = BACKEND_DIR / 'uploads' / 'faces'
MODEL_PATH = BACKEND_DIR.parent / 'mobile' / 'assets' / 'models' / 'mobilefacenet.tflite'

# Model configuration
INPUT_SIZE = 112
EMBEDDING_SIZE = 192

def get_db_connection():
    """Create database connection."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"[ERROR] Database connection error: {e}")
        sys.exit(1)

def load_model():
    """Load TFLite model."""
    if not MODEL_PATH.exists():
        print(f"[ERROR] Model not found: {MODEL_PATH}")
        print(f"[ERROR] Please ensure mobilefacenet.tflite exists in mobile/assets/models/")
        sys.exit(1)
    
    try:
        interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
        interpreter.allocate_tensors()
        print(f"[SUCCESS] Model loaded: {MODEL_PATH.name}")
        return interpreter
    except Exception as e:
        print(f"[ERROR] Failed to load model: {e}")
        sys.exit(1)

def preprocess_image(image_path):
    """
    Preprocess image for MobileFaceNet with face detection.
    Detects face, crops it, then resizes to 112x112.
    Returns 112x112 normalized image array.
    """
    try:
        # Read image
        img = cv2.imread(str(image_path))
        if img is None:
            return None
        
        # Convert BGR to RGB for face detection
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Detect faces using Haar Cascade (lightweight, no extra deps)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(img_rgb, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        
        if len(faces) == 0:
            print(f"[WARNING] No face detected in {image_path.name}, using full image")
            # If no face detected, use center crop as fallback
            h, w = img_rgb.shape[:2]
            size = min(h, w)
            start_x = (w - size) // 2
            start_y = (h - size) // 2
            img_rgb = img_rgb[start_y:start_y+size, start_x:start_x+size]
        else:
            # Use the largest detected face
            (x, y, w, h) = max(faces, key=lambda rect: rect[2] * rect[3])
            
            # Add padding (10% on each side)
            pad = int(max(w, h) * 0.1)
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(img_rgb.shape[1], x + w + pad)
            y2 = min(img_rgb.shape[0], y + h + pad)
            
            # Crop face region
            img_rgb = img_rgb[y1:y2, x1:x2]
        
        # Resize to 112x112
        img_rgb = cv2.resize(img_rgb, (INPUT_SIZE, INPUT_SIZE))
        
        # Normalize to [-1, 1]
        img_rgb = img_rgb.astype(np.float32)
        img_rgb = (img_rgb / 127.5) - 1.0
        
        # Add batch dimension
        img_rgb = np.expand_dims(img_rgb, axis=0)
        
        return img_rgb
    except Exception as e:
        print(f"[ERROR] Preprocessing error: {e}")
        return None

def extract_embedding(interpreter, image_path):
    """Extract face embedding from image using TFLite model."""
    try:
        # Preprocess image
        input_data = preprocess_image(image_path)
        if input_data is None:
            print(f"[WARNING] Failed to preprocess: {image_path.name}")
            return None
        
        # Get input and output details
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        
        # Set input tensor
        interpreter.set_tensor(input_details[0]['index'], input_data)
        
        # Run inference
        interpreter.invoke()
        
        # Get output tensor
        embedding = interpreter.get_tensor(output_details[0]['index'])[0]
        
        # Normalize (L2 normalization)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return embedding.tolist()
    
    except Exception as e:
        print(f"[ERROR] Error processing {image_path.name}: {e}")
        return None

def process_user_embeddings(conn, interpreter, user_id):
    """Process all images for a user and update embeddings."""
    cur = conn.cursor()
    
    try:
        # Get all face images for user
        cur.execute(
            "SELECT id, image_url FROM face_images WHERE user_id = %s ORDER BY created_at",
            (user_id,)
        )
        
        images = cur.fetchall()
        
        if not images:
            print(f"[WARNING] No images found for user {user_id}")
            return False
        
        print(f"\n[INFO] Processing user {user_id}: {len(images)} images")
        
        embeddings = []
        successful_images = []
        
        for img_id, image_url in images:
            # Get full path
            filename = os.path.basename(image_url)
            image_path = UPLOAD_DIR / filename
            
            if not image_path.exists():
                print(f"[WARNING] Image not found: {image_path}")
                continue
            
            # Extract embedding
            embedding = extract_embedding(interpreter, image_path)
            
            if embedding is not None:
                embeddings.append(embedding)
                successful_images.append(img_id)
                
                # Update face_images table with embedding
                cur.execute(
                    "UPDATE face_images SET embedding = %s WHERE id = %s",
                    (json.dumps(embedding), img_id)
                )
                
                print(f"  [OK] {filename}: Embedding extracted ({len(embedding)} dimensions)")
            else:
                print(f"  [FAIL] {filename}: Failed to extract")
        
        if len(embeddings) == 0:
            print(f"  [ERROR] No valid embeddings extracted for user {user_id}")
            return False
        
        # Update users table with all embeddings
        cur.execute(
            "UPDATE users SET face_embeddings = %s, updated_at = NOW() WHERE id = %s",
            (json.dumps(embeddings), user_id)
        )
        
        conn.commit()
        
        print(f"  [SUCCESS] Updated user {user_id}: {len(embeddings)} embeddings saved")
        return True
    
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] Error processing user {user_id}: {e}")
        return False
    
    finally:
        cur.close()

def main():
    """Main function."""
    print("=" * 60)
    print("Face Embedding Extraction Script (MobileFaceNet)")
    print("=" * 60)
    
    # Check if specific user_id provided as argument
    target_user_id = None
    if len(sys.argv) > 1:
        try:
            target_user_id = int(sys.argv[1])
            print(f"[INFO] Processing specific user: {target_user_id}")
        except ValueError:
            print(f"[WARNING] Invalid user_id: {sys.argv[1]}")
            sys.exit(1)
    
    # Check if upload directory exists
    if not UPLOAD_DIR.exists():
        print(f"[ERROR] Upload directory not found: {UPLOAD_DIR}")
        sys.exit(1)
    
    print(f"[INFO] Upload directory: {UPLOAD_DIR}")
    
    # Load model
    interpreter = load_model()
    
    # Connect to database
    conn = get_db_connection()
    print("[SUCCESS] Database connected")
    
    try:
        # Get users with face images
        cur = conn.cursor()
        
        if target_user_id:
            # Process specific user
            cur.execute("""
                SELECT DISTINCT user_id, u.name 
                FROM face_images fi
                JOIN users u ON fi.user_id = u.id
                WHERE user_id = %s
                ORDER BY user_id
            """, (target_user_id,))
        else:
            # Process all users
            cur.execute("""
                SELECT DISTINCT user_id, u.name 
                FROM face_images fi
                JOIN users u ON fi.user_id = u.id
                ORDER BY user_id
            """)
        
        users = cur.fetchall()
        cur.close()
        
        if not users:
            if target_user_id:
                print(f"[WARNING] No face images found for user {target_user_id}")
            else:
                print("[WARNING] No users with face images found")
            return
        
        print(f"\n[INFO] Found {len(users)} user(s) with face images")
        
        # Process each user
        success_count = 0
        for user_id, user_name in users:
            if process_user_embeddings(conn, interpreter, user_id):
                success_count += 1
        
        print("\n" + "=" * 60)
        print(f"[COMPLETE] {success_count}/{len(users)} users processed successfully")
    
    except Exception as e:
        print(f"\n[ERROR] {e}")
    
    finally:
        conn.close()
        print("[INFO] Database connection closed")

if __name__ == "__main__":
    main()
