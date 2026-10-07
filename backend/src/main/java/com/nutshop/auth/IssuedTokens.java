package com.nutshop.auth;

/** A fresh access/refresh pair. Only ever sent to the client as httpOnly cookies, never in a response body. */
public record IssuedTokens(String accessToken, String refreshToken) {
}
