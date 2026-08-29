use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::AesGcm;
use aes_gcm::aes::Aes256;
use sha2::{Digest, Sha256};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as b64;
use rand::Rng;

// Define Aes256Gcm with a 16-byte Nonce (U16) to match Node's crypto.randomBytes(16)
type Aes256Gcm16 = AesGcm<Aes256, aes_gcm::aead::consts::U16>;

fn get_encryption_key() -> Result<[u8; 32], String> {
    let key_str = std::env::var("CONFIG_ENCRYPTION_KEY")
        .map_err(|_| "CONFIG_ENCRYPTION_KEY environment variable is missing.".to_string())?;
    
    let mut hasher = Sha256::new();
    hasher.update(key_str.as_bytes());
    let result = hasher.finalize();
    
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    Ok(key)
}

pub fn encrypt_secret(text: &str) -> Result<String, String> {
    let key_bytes = get_encryption_key()?;
    let cipher = Aes256Gcm16::new_from_slice(&key_bytes).map_err(|_| "Invalid key length")?;
    
    let mut iv = [0u8; 16];
    let mut rng = rand::rng();
    rng.fill_bytes(&mut iv);
    
    let nonce: &aes_gcm::Nonce<aes_gcm::aead::consts::U16> = &iv.into();

    let ciphertext = cipher.encrypt(nonce, text.as_bytes())
        .map_err(|e| format!("Encryption failed: {:?}", e))?;

    let len = ciphertext.len();
    if len < 16 {
        return Err("Ciphertext too short".into());
    }
    let encrypted_only = &ciphertext[..len - 16];
    let auth_tag = &ciphertext[len - 16..];

    let iv_b64 = b64.encode(&iv);
    let enc_b64 = b64.encode(encrypted_only);
    let tag_b64 = b64.encode(auth_tag);

    Ok(format!("ENC[{}:{}:{}]", iv_b64, enc_b64, tag_b64))
}

pub fn decrypt_secret(encrypted_data: &str) -> Result<String, String> {
    if !encrypted_data.starts_with("ENC[") || !encrypted_data.ends_with("]") {
        return Ok(encrypted_data.to_string());
    }

    let payload = &encrypted_data[4..encrypted_data.len() - 1];
    let parts: Vec<&str> = payload.split(':').collect();
    if parts.len() != 3 {
        return Err("Invalid encrypted format".into());
    }

    let iv_vec = b64.decode(parts[0]).map_err(|_| "Invalid IV base64")?;
    let iv: [u8; 16] = iv_vec.try_into().map_err(|_| "Invalid IV length")?;
    let encrypted_only = b64.decode(parts[1]).map_err(|_| "Invalid encrypted base64")?;
    let auth_tag = b64.decode(parts[2]).map_err(|_| "Invalid tag base64")?;

    let mut combined_ciphertext = encrypted_only;
    combined_ciphertext.extend_from_slice(&auth_tag);

    let key_bytes = get_encryption_key()?;
    let cipher = Aes256Gcm16::new_from_slice(&key_bytes).map_err(|_| "Invalid key length")?;
    let nonce: &aes_gcm::Nonce<aes_gcm::aead::consts::U16> = &iv.into();

    let decrypted_bytes = cipher.decrypt(nonce, combined_ciphertext.as_ref())
        .map_err(|e| format!("Decryption failed: {:?}", e))?;

    String::from_utf8(decrypted_bytes).map_err(|_| "Invalid UTF-8 in decrypted data".into())
}

pub fn is_encrypted(text: &str) -> bool {
    text.starts_with("ENC[") && text.ends_with("]")
}
