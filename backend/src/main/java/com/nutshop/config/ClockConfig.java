package com.nutshop.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

	/** Injected wherever "now" matters, so tests can control time. */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}
}
