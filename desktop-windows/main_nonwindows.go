//go:build !windows
package main

// Tests can run on non-Windows build workers; shipped executable is Windows-only.
func main() {}
