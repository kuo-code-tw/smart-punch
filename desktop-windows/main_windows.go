//go:build windows
package main

import (
	"syscall"
	"unsafe"
)

func alert(text string) {
	title,_ := syscall.UTF16PtrFromString("79號碼頭雲端智慧系統")
	content,_ := syscall.UTF16PtrFromString(text)
	proc := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	proc.Call(0,uintptr(unsafe.Pointer(content)),uintptr(unsafe.Pointer(title)),0x10)
}

func main(){if err:=startEdge();err!=nil{alert("系統無法啟動：\n"+err.Error())}}
