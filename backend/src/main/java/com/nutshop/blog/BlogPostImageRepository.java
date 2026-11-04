package com.nutshop.blog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BlogPostImageRepository extends JpaRepository<BlogPostImage, UUID> {

	List<BlogPostImage> findByPostIdOrderByCreatedAtAsc(Long postId);
}
