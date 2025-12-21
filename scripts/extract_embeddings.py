#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract face embeddings from uploaded images and update database.
This script processes face images and generates embeddings for face recognition.
"""

import os
import sys
import json
import psycopg2
from pathlib import Path
import numpy as np
from PIL import Image
import face_recognition

# Force UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'ignore')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'ignore')

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'tia_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres')
}

# Upload directory
UPLOAD_DIR = Path(__file__).parent.parent / 'uploads' / 'faces'

def get_db_connection():
    """Create database connection."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"[ERROR] Database connection error: {e}")
        sys.exit(1)

def extract_embedding(image_path):
    """Extract face embedding from image."""
    try:
        # Load image
        image = face_recognition.load_image_file(str(image_path))
        
        # Get face encodings (embeddings)
        encodings = face_recognition.face_encodings(image)
        
        if len(encodings) == 0:
            print(f"[WARNING] No face detected in: {image_path.name}")
            return None
        
        # Return first encoding as list
        return encodings[0].tolist()
    
    except Exception as e:
        print(f"[ERROR] Error processing {image_path.name}: {e}")
        return None

def process_user_embeddings(conn, user_id):
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
            embedding = extract_embedding(image_path)
            
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
    print("Face Embedding Extraction Script")
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
            if process_user_embeddings(conn, user_id):
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
