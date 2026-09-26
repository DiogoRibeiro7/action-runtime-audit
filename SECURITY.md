# Security policy

The latest published release is the supported version. Before the first
release, reports about the `main` branch are welcome.

This action reads workflow and action metadata through the GitHub Contents API.
Give its token only the repository Contents read access it needs. A token for
private dependencies must additionally have Contents read access to those
repositories. Avoid sharing tokens or private workflow contents in issues.

To report a vulnerability, use GitHub's private vulnerability reporting for
this repository when available. If that option is unavailable, contact the
maintainer privately via their GitHub profile. Please do not post exploit
details in a public issue.
