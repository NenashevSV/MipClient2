#: -*- coding: utf-8 -*-
import asyncio
import logging
import os
import errno
import re
from logging.handlers import TimedRotatingFileHandler
import websockets
from websockets import WebSocketServerProtocol
import time
import sys
import json

VERSION = "2.0.0"

DEBUG = True

LOG_LEVEL = logging.WARNING

#: хост сервера webSocket
LISTEN_HOST = '127.0.0.1'
#: номер порта сервера webSocket
LISTEN_PORT = 9090
#: хост Messenger
MESSENGER_HOST = '127.0.0.1'
#: номер порта Messenger для администрирования
MESSENGER_PORT = 7559
#: время до переподключения при сбое подключения к Messenger
MESSENGER_RECONNECT_TIME = 5

#: название приложения
APP_NAME = 'MolniaTerminal'
#: путь до приложения
APP_DIR = os.path.abspath(os.path.dirname(__file__))
#: форматирование отображения времени
DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
#: форматирование отображения времени
SHORT_DATETIME_FORMAT = "%H:%M:%S"

#####################
#: НАСТРОЙКА ЛОГОВ :#
#####################
#: путь до файла кофигарции
CONFIG_DIR = os.path.abspath(os.path.dirname(__file__))
#: путь до места хранения логов
LOGS_DIR = os.path.join(APP_DIR, 'logs')
#: название файла лога
LOG_FILENAME = os.path.join(LOGS_DIR, APP_NAME + '.log')
#: количество дней за которые будет храниться лог
LOGS_DAYS_KEEP = 7
#: Форматтер сообщений
FORMATTER = logging.Formatter("%(asctime)s — %(name)s — %(levelname)s — %(message)s")

def get_console_handler():
	console_handler = logging.StreamHandler(sys.stdout)
	console_handler.setFormatter(FORMATTER)
	console_handler.setLevel(logging.DEBUG)
	return console_handler

def get_file_handler():
	file_handler = TimedRotatingFileHandler(LOG_FILENAME, when='midnight')
	file_handler.setFormatter(FORMATTER)
	file_handler.setLevel(logging.WARNING)
	return file_handler

def get_logger(logger_name, consoleOut=True):
	logger = logging.getLogger(logger_name)
	logger.setLevel(logging.DEBUG)
	if consoleOut:
		logger.addHandler(get_console_handler())
	logger.addHandler(get_file_handler())
	# with this pattern, it's rarely necessary to propagate the error up to parent
	logger.propagate = False
	return logger

def configure_logs():
	""" Настраивает журналирование. В зависимости от режима работы выбирает
	способ журналирования.Создает папку для хранения логов если необходимо
	"""
	if DEBUG:
		logging.basicConfig(level=logging.DEBUG)
	else:
		#: прежде всего создаем папку для хранения, если ее нет
		try:
			os.makedirs(LOGS_DIR)
		except OSError as exception:
			if exception.errno != errno.EEXIST:
				raise
		#: делим логи по дням
		handler = TimedRotatingFileHandler(LOG_FILENAME,
											when="midnight",
											backupCount=LOGS_DAYS_KEEP)
		format = '%(asctime)s: %(levelname)-6s %(message)s'
		log_format=logging.Formatter(fmt=format, datefmt='%y-%m-%d %H:%M:%S')
		handler.setFormatter(log_format)

		logger = logging.getLogger(APP_NAME)
		logger.setLevel(LOG_LEVEL)
		logger.addHandler(handler)
		#: start message
		logger.info('='*79)

class WSServer:
	connections = {}
	def __init__(self):
		self.reader = None
		self.writer = None

	async def connected(self, ws: WebSocketServerProtocol) -> None:
		self.connections[ws] = set()
		logging.info(f'{ws.remote_address} connects.')


	def unsubscribeDevices(self, devices) -> None:
		for device in devices:
			self.unsubscribeDevice(device)


	def unsubscribeDevice(self, device):
		if not self.hasDevice(device):
			command = 'unsubscribe ' + device
			self.writeToMessenger(command)


	def subscribeDevice(self, device):
		if not self.hasDevice(device):
			command = 'subscribe ' + device
			self.writeToMessenger(command)


	async def disconnected(self, ws: WebSocketServerProtocol) -> None:
		devices = self.connections.pop(ws, None)
		self.unsubscribeDevices(devices)
		if (len(self.connections)==0):
			self.writeToMessenger('unsubscribe all')
			logging.info('unsubscribe all')
		logging.info(f'{ws.remote_address} disconnects.')


	def getDeviceFromMessage(self, message: str):
		match = re.search(r'\[(\d+)\]', message)
		if match.group:
			return match[1]
		else:
			return None

	def getConnectionsForDevice(self, device: str):
		connections = set()
		if device:
			for connection in self.connections.keys():
				if device in self.connections[connection]:
					connections.add(connection)
		else:
			connections = set(self.connections.keys())
		return connections


	async def send_to_connections(self, message: str) -> None:
		if self.connections:
			await asyncio.wait([connection.send(message) for connection in self.connections])

	def subscribe(self, connection, device: str):
		self.connections[connection].add(device)
		return True

	def hasDevice(self, device):
		exist = False
		for conDevices in self.connections.values():
			if device in conDevices:
				exist = True
				break


	def unsubscribe(self, connection, device):
		self.connections[connection].discard(device)
		return not self.hasDevice(device)

	def commandFromMessage(self, message, connection):
		data = json.loads(message)
		user = data['user']
		sendToMessenger = True
		if 'messengerCommand' in data.keys():
			cmd = data['messengerCommand']
			device = str(data['device'])
			command = f"{cmd} {device}"
			if re.search(r'^subscribe', cmd.lower()):
				sendToMessenger = self.subscribe(connection, device)
			if re.search(r'^unsubscribe', cmd.lower()):
				sendToMessenger = self.unsubscribe(connection, device)
		else:
			cmd = data['command']
			device = data['device']
			command = f"device {device} cmd {cmd}"
		return command, user, device, sendToMessenger

	def writeToMessenger(self, command):
		command = command + '\r\n'
		self.writer.write(command.encode())
		logger.info('Send command:"'+command+'"')

	async def distribute(self, ws: WebSocketServerProtocol) -> None:
		async for message in ws:
			command, user, device, sendToMessenger = self.commandFromMessage(message, ws)
			if sendToMessenger:
				self.writeToMessenger(command)
			await self.send_to_connections(f'[{device}] {user} - {command}')

	async def ws_handler(self, ws: WebSocketServerProtocol, uri: str)-> None:
		logger.info(f'connected {ws.remote_address}')
		await self.connected(ws)
		try:
			await self.distribute(ws)
		finally:
			await self.disconnected(ws)


	async def setReaderWriter(self, reader, writer):
		logger.info('setReaderWriter')
		self.reader = reader
		self.writer = writer


async def Messenger_reader(wsserver: WSServer):
	cycle = True
	while cycle:
		logger.info('Waiting fo data')
		try:
			data = await wsserver.reader.readline()
			logger.info(f'Received from messenger: {data.decode()!r}')
			await wsserver.send_to_connections(data.decode())
		except:
			cycle = False
	logger.warning('Close the connection')
	await wsserver.setReaderWriter(None, None)
	wsserver.writer.close()
	await wsserver.writer.wait_closed()

async def Messenger_connect(wsserver: WSServer):
	reader, writer = await asyncio.open_connection(MESSENGER_HOST, MESSENGER_PORT)
	await wsserver.setReaderWriter(reader, writer)


async def Messeng_to_wsserver(wsserver, messeng):
	await wsserver.send_to_connections(messeng)


def main():
	logger.info('Create WSServer')
	wsserver = WSServer()

	start_wsserver = websockets.serve(wsserver.ws_handler, LISTEN_HOST, LISTEN_PORT)

	loop = asyncio.get_event_loop()
	loop.run_until_complete(start_wsserver)
	logger.info('Run WSServer')
	while True:
		try:
			loop.run_until_complete(Messenger_connect(wsserver))
			logger.info('Connect to messenger')
			loop.run_until_complete(Messeng_to_wsserver(wsserver, 'Connected to messenger'))
			loop.run_until_complete(Messenger_reader(wsserver))
		except:
			loop.run_until_complete(Messeng_to_wsserver(wsserver, f'Failed connect to messenger. Reconnect after {MESSENGER_RECONNECT_TIME} sec.'))
			logger.warning(f'Reconnect to Messenger after {MESSENGER_RECONNECT_TIME} sec.')
			time.sleep(MESSENGER_RECONNECT_TIME)
			logger.warning('Recconnect to Messenger.')


if __name__ == '__main__':
	#: start message
	logger = get_logger(__name__, DEBUG)
	logger.info('=' * 79)
	logger.warning('!' * 79)

	main()