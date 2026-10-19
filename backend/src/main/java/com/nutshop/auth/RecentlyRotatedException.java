package com.nutshop.auth;

import com.nutshop.common.UnauthorizedException;

/**
 * The refresh token was rotated moments ago by another request of the same browser (two tabs refreshing at once).
 * Refused, but the cookies are left alone: the browser already holds the new ones.
 */
public class RecentlyRotatedException extends UnauthorizedException {

	public RecentlyRotatedException(String message) {
		super(message);
	}
}
