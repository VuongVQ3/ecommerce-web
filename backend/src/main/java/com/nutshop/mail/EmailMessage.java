package com.nutshop.mail;

/** A transactional email. {@code html} must already be escaped; {@code text} is the plain-text alternative. */
public record EmailMessage(String to, String subject, String html, String text) {
}
