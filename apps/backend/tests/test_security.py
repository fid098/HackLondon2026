"""
test_security.py — Unit tests for password hashing and JWT utilities.
"""

import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_differs_from_plain(self):
        assert hash_password("mysecret") != "mysecret"

    def test_verify_correct_password(self):
        hashed = hash_password("correct-horse-battery-staple")
        assert verify_password("correct-horse-battery-staple", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_same_password_produces_different_hashes(self):
        h1 = hash_password("password")
        h2 = hash_password("password")
        assert h1 != h2  # bcrypt uses a random salt


class TestJWT:
    def test_encode_decode_roundtrip(self):
        token = create_access_token("user-id-123")
        assert decode_access_token(token) == "user-id-123"

    def test_tampered_token_returns_none(self):
        token = create_access_token("user-123")
        tampered = token[:-5] + "XXXXX"
        assert decode_access_token(tampered) is None

    def test_garbage_token_returns_none(self):
        assert decode_access_token("not.a.jwt") is None

    def test_empty_string_returns_none(self):
        assert decode_access_token("") is None
