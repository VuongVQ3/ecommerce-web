package com.nutshop.dam;

import com.nutshop.common.PageResponse;
import com.nutshop.content.AuthorActor;
import com.nutshop.content.ContentReferenceService.Usage;
import com.nutshop.dam.DamDtos.AssetDetail;
import com.nutshop.dam.DamDtos.AssetRow;
import com.nutshop.dam.DamDtos.CreateFolderRequest;
import com.nutshop.dam.DamDtos.FolderNode;
import com.nutshop.dam.DamDtos.MetadataRequest;
import com.nutshop.dam.DamDtos.MoveRequest;
import com.nutshop.dam.DamDtos.RenameFolderRequest;
import com.nutshop.media.AssetTypes.Kind;
import com.nutshop.security.Roles;
import com.nutshop.user.Role;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Assets (DAM) in the Author environment. Everyone who may author (STAFF, ADMIN) can browse, upload, edit, move,
 * replace and manage folders; deleting needs {@code ContentPermissions.canDelete} (checked through AuthorActor).
 */
@RestController
@RequestMapping("/api/author/assets")
@Roles({ Role.STAFF, Role.ADMIN })
public class AuthorAssetController {

	private final DamAssetService assets;
	private final DamFolderService folders;

	public AuthorAssetController(DamAssetService assets, DamFolderService folders) {
		this.assets = assets;
		this.folders = folders;
	}

	// ---- folders --------------------------------------------------------------------------------------------

	@GetMapping("/folders")
	public List<FolderNode> folders() {
		return folders.tree();
	}

	@PostMapping("/folders")
	@ResponseStatus(HttpStatus.CREATED)
	public FolderNode createFolder(@Valid @RequestBody CreateFolderRequest req, @AuthenticationPrincipal Jwt jwt) {
		return folders.create(req.parentId(), req.name(), AuthorActor.of(jwt).id());
	}

	@PatchMapping("/folders/{id}")
	public DamFolderService.Folder renameFolder(@PathVariable long id, @Valid @RequestBody RenameFolderRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return folders.rename(id, req.name(), AuthorActor.of(jwt).id());
	}

	@DeleteMapping("/folders/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteFolder(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
		folders.delete(id, AuthorActor.of(jwt).requireDelete().id());
	}

	// ---- assets ---------------------------------------------------------------------------------------------

	@GetMapping
	public PageResponse<AssetRow> list(@RequestParam(required = false) Long folderId,
			@RequestParam(defaultValue = "false") boolean includeSubfolders, @RequestParam(required = false) String q,
			@RequestParam(required = false) Kind kind, @RequestParam(required = false) String tag,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + DamAssetService.DEFAULT_PAGE_SIZE) int size) {
		return assets.list(folderId, includeSubfolders, q, kind, tag, page, size);
	}

	/** One file per request (at most 10MB). 409 DUPLICATE_ASSET with assetId for a known file. */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public AssetDetail upload(@RequestPart(name = "file", required = false) MultipartFile file,
			@RequestParam long folderId, @RequestParam(required = false) String title,
			@RequestParam(required = false) String alt, @AuthenticationPrincipal Jwt jwt) throws IOException {
		return assets.upload(bytes(file), file == null ? null : file.getOriginalFilename(), folderId, title, alt,
				AuthorActor.of(jwt).id());
	}

	@GetMapping("/{id}")
	public AssetDetail get(@PathVariable UUID id) {
		return assets.get(id);
	}

	@PatchMapping("/{id}")
	public AssetDetail updateMetadata(@PathVariable UUID id, @Valid @RequestBody MetadataRequest req,
			@AuthenticationPrincipal Jwt jwt) {
		return assets.updateMetadata(id, req, AuthorActor.of(jwt).id());
	}

	@PostMapping("/{id}/move")
	public AssetDetail move(@PathVariable UUID id, @Valid @RequestBody MoveRequest req, @AuthenticationPrincipal Jwt jwt) {
		return assets.move(id, req.folderId(), AuthorActor.of(jwt).id());
	}

	@PostMapping(path = "/{id}/replace", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public AssetDetail replace(@PathVariable UUID id, @RequestPart(name = "file", required = false) MultipartFile file,
			@AuthenticationPrincipal Jwt jwt) throws IOException {
		return assets.replace(id, bytes(file), file == null ? null : file.getOriginalFilename(), AuthorActor.of(jwt).id());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
		assets.delete(id, AuthorActor.of(jwt).requireDelete().id());
	}

	@GetMapping("/{id}/usages")
	public List<Usage> usages(@PathVariable UUID id) {
		return assets.usages(id);
	}

	private static byte[] bytes(MultipartFile file) throws IOException {
		return file == null ? null : file.getBytes();
	}
}
